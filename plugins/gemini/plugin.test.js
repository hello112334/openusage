import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const SETTINGS_PATH = "~/.gemini/settings.json"
const CREDS_PATH = "~/.gemini/oauth_creds.json"

const LOAD_CODE_ASSIST_URL = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist"
const QUOTA_URL = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota"
const PROJECTS_URL = "https://cloudresourcemanager.googleapis.com/v1/projects"
const TOKEN_URL = "https://oauth2.googleapis.com/token"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }), "utf8").toString("base64url")
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return `${header}.${body}.sig`
}

describe("gemini plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when auth type is api-key", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(SETTINGS_PATH, JSON.stringify({ authType: "api-key" }))
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("api-key")
  })

  it("throws when auth type is unsupported", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(SETTINGS_PATH, JSON.stringify({ authType: "unknown-mode" }))
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("unsupported auth type")
  })

  it("throws when creds are missing", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Not logged in")
  })

  it("throws when creds do not contain an access token", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(CREDS_PATH, JSON.stringify({ refresh_token: "refresh-only" }))
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Not logged in")
  })

  it("uses the current token even when local expiry is stale and never calls the OAuth token endpoint", async () => {
    const ctx = makeCtx()
    const nowMs = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(nowMs)

    ctx.host.fs.writeText(
      CREDS_PATH,
      JSON.stringify({
        access_token: "old-token",
        refresh_token: "refresh-token",
        id_token: makeJwt({ email: "me@example.com" }),
        expiry_date: nowMs - 1000,
      })
    )

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url === TOKEN_URL) throw new Error("unexpected oauth refresh")
      if (url === LOAD_CODE_ASSIST_URL) {
        expect(opts.headers.Authorization).toBe("Bearer old-token")
        return {
          status: 200,
          bodyText: JSON.stringify({ tier: "standard-tier", cloudaicompanionProject: "gen-lang-client-123" }),
        }
      }
      if (url === QUOTA_URL) {
        expect(opts.headers.Authorization).toBe("Bearer old-token")
        expect(opts.bodyText).toContain("gen-lang-client-123")
        return {
          status: 200,
          bodyText: JSON.stringify({
            quotaBuckets: [
              { modelId: "gemini-2.5-pro", remainingFraction: 0.2, resetTime: "2099-01-01T00:00:00Z" },
              { modelId: "gemini-2.5-pro", remainingFraction: 0.4, resetTime: "2099-01-01T00:00:00Z" },
              { modelId: "gemini-2.0-flash", remainingFraction: 0.6, resetTime: "2099-01-02T00:00:00Z" },
            ],
          }),
        }
      }
      throw new Error("unexpected url: " + url)
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBe("Paid")

    const pro = result.lines.find((line) => line.label === "Pro")
    const flash = result.lines.find((line) => line.label === "Flash")
    const account = result.lines.find((line) => line.label === "Account")
    expect(pro && pro.used).toBe(80)
    expect(flash && flash.used).toBe(40)
    expect(account && account.value).toBe("me@example.com")
  })

  it("uses project fallback and maps workspace tier", async () => {
    const ctx = makeCtx()
    const nowMs = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(nowMs)

    ctx.host.fs.writeText(
      CREDS_PATH,
      JSON.stringify({
        access_token: "token",
        id_token: makeJwt({ email: "corp@example.com", hd: "example.com" }),
        expiry_date: nowMs + 3600_000,
      })
    )

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url === LOAD_CODE_ASSIST_URL) {
        return { status: 200, bodyText: JSON.stringify({ tier: "free-tier" }) }
      }
      if (url === PROJECTS_URL) {
        return {
          status: 200,
          bodyText: JSON.stringify({ projects: [{ projectId: "other-project" }, { projectId: "gen-lang-client-456" }] }),
        }
      }
      if (url === QUOTA_URL) {
        expect(opts.bodyText).toContain("gen-lang-client-456")
        return {
          status: 200,
          bodyText: JSON.stringify({
            buckets: [{ modelId: "gemini-2.5-pro", remainingFraction: 0.75, resetTime: "2099-01-01T00:00:00Z" }],
          }),
        }
      }
      throw new Error("unexpected url: " + url)
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBe("Workspace")
    expect(result.lines.find((line) => line.label === "Pro")).toBeTruthy()
  })

  it("throws session expired when loadCodeAssist returns 401", async () => {
    const ctx = makeCtx()
    const nowMs = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(nowMs)

    ctx.host.fs.writeText(
      CREDS_PATH,
      JSON.stringify({
        access_token: "token",
        refresh_token: "refresh-token",
        id_token: makeJwt({ email: "me@example.com" }),
        expiry_date: nowMs + 3600_000,
      })
    )

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url === TOKEN_URL) throw new Error("unexpected oauth refresh")
      if (url === LOAD_CODE_ASSIST_URL) return { status: 401, bodyText: "" }
      return { status: 404, bodyText: "" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("session expired")
  })

  it("throws session expired when quota returns 401", async () => {
    const ctx = makeCtx()
    const nowMs = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(nowMs)

    ctx.host.fs.writeText(
      CREDS_PATH,
      JSON.stringify({
        access_token: "token",
        refresh_token: "refresh-token",
        id_token: makeJwt({ email: "me@example.com" }),
        expiry_date: nowMs + 3600_000,
      })
    )

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url === TOKEN_URL) throw new Error("unexpected oauth refresh")
      if (url === LOAD_CODE_ASSIST_URL) {
        return {
          status: 200,
          bodyText: JSON.stringify({ tier: "standard-tier", cloudaicompanionProject: "gen-lang-client-123" }),
        }
      }
      if (url === QUOTA_URL) return { status: 401, bodyText: "" }
      return { status: 404, bodyText: "" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("session expired")
  })
})
