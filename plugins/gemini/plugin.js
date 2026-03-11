(function () {
  const SETTINGS_PATH = "~/.gemini/settings.json"
  const CREDS_PATH = "~/.gemini/oauth_creds.json"
  const LOAD_CODE_ASSIST_URL = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist"
  const QUOTA_URL = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota"
  const PROJECTS_URL = "https://cloudresourcemanager.googleapis.com/v1/projects"
  const REFRESH_BUFFER_MS = 5 * 60 * 1000

  const IDE_METADATA = {
    ideType: "IDE_UNSPECIFIED",
    platform: "PLATFORM_UNSPECIFIED",
    pluginType: "GEMINI",
    duetProject: "default",
  }

  function loadSettings(ctx) {
    if (!ctx.host.fs.exists(SETTINGS_PATH)) return null
    try {
      return ctx.util.tryParseJson(ctx.host.fs.readText(SETTINGS_PATH))
    } catch (e) {
      ctx.host.log.warn("failed reading settings: " + String(e))
      return null
    }
  }

  function assertSupportedAuthType(ctx) {
    const settings = loadSettings(ctx)
    const authType =
      settings && typeof settings.authType === "string"
        ? settings.authType.trim().toLowerCase()
        : settings &&
            settings.security &&
            settings.security.auth &&
            typeof settings.security.auth.selectedType === "string"
          ? settings.security.auth.selectedType.trim().toLowerCase()
          : null

    if (!authType || authType === "oauth-personal") return
    if (authType === "api-key") {
      throw "Gemini auth type api-key is not supported by this plugin yet."
    }
    if (authType === "vertex-ai") {
      throw "Gemini auth type vertex-ai is not supported by this plugin yet."
    }
    throw "Gemini unsupported auth type: " + authType
  }

  function loadOauthCreds(ctx) {
    if (!ctx.host.fs.exists(CREDS_PATH)) return null
    try {
      const parsed = ctx.util.tryParseJson(ctx.host.fs.readText(CREDS_PATH))
      if (!parsed || typeof parsed !== "object") return null
      if (typeof parsed.access_token !== "string" || !parsed.access_token) return null
      return parsed
    } catch (e) {
      ctx.host.log.warn("failed reading creds: " + String(e))
      return null
    }
  }

  function readNumber(value) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  function decodeIdToken(ctx, token) {
    if (typeof token !== "string" || !token) return null
    try {
      const payload = ctx.jwt.decodePayload(token)
      return payload && typeof payload === "object" ? payload : null
    } catch {
      return null
    }
  }

  function needsRefresh(creds) {
    if (!creds.access_token) return true
    const expiry = readNumber(creds.expiry_date)
    if (expiry === null) return false
    const expiryMs = expiry > 10_000_000_000 ? expiry : expiry * 1000
    return Date.now() + REFRESH_BUFFER_MS >= expiryMs
  }

  function postJson(ctx, url, accessToken, body) {
    return ctx.util.request({
      method: "POST",
      url,
      headers: {
        Authorization: "Bearer " + accessToken,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      bodyText: JSON.stringify(body || {}),
      timeoutMs: 10000,
    })
  }

  function readFirstStringDeep(value, keys) {
    if (!value || typeof value !== "object") return null

    for (let i = 0; i < keys.length; i += 1) {
      const v = value[keys[i]]
      if (typeof v === "string" && v.trim()) return v.trim()
    }

    const nested = Object.values(value)
    for (let i = 0; i < nested.length; i += 1) {
      const found = readFirstStringDeep(nested[i], keys)
      if (found) return found
    }
    return null
  }

  function mapTierToPlan(tier, idTokenPayload) {
    if (!tier) return null
    const normalized = String(tier).trim().toLowerCase()
    if (normalized === "standard-tier") return "Paid"
    if (normalized === "legacy-tier") return "Legacy"
    if (normalized === "free-tier") return idTokenPayload && idTokenPayload.hd ? "Workspace" : "Free"
    return null
  }

  function discoverProjectId(ctx, accessToken, loadCodeAssistData) {
    const fromLoadCodeAssist = readFirstStringDeep(loadCodeAssistData, ["cloudaicompanionProject"])
    if (fromLoadCodeAssist) return fromLoadCodeAssist

    let projectsResp
    try {
      projectsResp = ctx.util.request({
        method: "GET",
        url: PROJECTS_URL,
        headers: { Authorization: "Bearer " + accessToken, Accept: "application/json" },
        timeoutMs: 10000,
      })
    } catch (e) {
      ctx.host.log.warn("project discovery failed: " + String(e))
      return null
    }

    if (projectsResp.status < 200 || projectsResp.status >= 300) return null
    const projectsData = ctx.util.tryParseJson(projectsResp.bodyText)
    const projects = projectsData && Array.isArray(projectsData.projects) ? projectsData.projects : []
    for (let i = 0; i < projects.length; i += 1) {
      const project = projects[i]
      const projectId = project && typeof project.projectId === "string" ? project.projectId : null
      if (!projectId) continue
      if (projectId.indexOf("gen-lang-client") === 0) return projectId
      const labels = project && project.labels && typeof project.labels === "object" ? project.labels : null
      if (labels && labels["generative-language"] !== undefined) return projectId
    }
    return null
  }

  function collectQuotaBuckets(value, out) {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) collectQuotaBuckets(value[i], out)
      return
    }
    if (!value || typeof value !== "object") return

    if (typeof value.remainingFraction === "number") {
      const modelId =
        typeof value.modelId === "string"
          ? value.modelId
          : typeof value.model_id === "string"
            ? value.model_id
            : "unknown"
      out.push({
        modelId,
        remainingFraction: value.remainingFraction,
        resetTime: value.resetTime || value.reset_time || null,
      })
    }

    const nested = Object.values(value)
    for (let i = 0; i < nested.length; i += 1) collectQuotaBuckets(nested[i], out)
  }

  function pickLowestRemainingBucket(buckets) {
    let best = null
    for (let i = 0; i < buckets.length; i += 1) {
      const bucket = buckets[i]
      if (!Number.isFinite(bucket.remainingFraction)) continue
      if (!best || bucket.remainingFraction < best.remainingFraction) best = bucket
    }
    return best
  }

  function toUsageLine(ctx, label, bucket) {
    const clampedRemaining = Math.max(0, Math.min(1, Number(bucket.remainingFraction)))
    const used = Math.round((1 - clampedRemaining) * 100)
    const resetsAt = ctx.util.toIso(bucket.resetTime)
    const opts = {
      label,
      used,
      limit: 100,
      format: { kind: "percent" },
    }
    if (resetsAt) opts.resetsAt = resetsAt
    return ctx.line.progress(opts)
  }

  function parseQuotaLines(ctx, quotaData) {
    const buckets = []
    collectQuotaBuckets(quotaData, buckets)
    if (!buckets.length) return []

    const proBuckets = []
    const flashBuckets = []
    for (let i = 0; i < buckets.length; i += 1) {
      const bucket = buckets[i]
      const lower = String(bucket.modelId || "").toLowerCase()
      if (lower.indexOf("gemini") !== -1 && lower.indexOf("pro") !== -1) {
        proBuckets.push(bucket)
      } else if (lower.indexOf("gemini") !== -1 && lower.indexOf("flash") !== -1) {
        flashBuckets.push(bucket)
      }
    }

    const lines = []
    const pro = pickLowestRemainingBucket(proBuckets)
    if (pro) lines.push(toUsageLine(ctx, "Pro", pro))
    const flash = pickLowestRemainingBucket(flashBuckets)
    if (flash) lines.push(toUsageLine(ctx, "Flash", flash))
    return lines
  }

  function fetchLoadCodeAssist(ctx, accessToken) {
    const resp = postJson(ctx, LOAD_CODE_ASSIST_URL, accessToken, { metadata: IDE_METADATA })
    if (ctx.util.isAuthStatus(resp.status)) {
      throw "Gemini session expired. Run `gemini auth login` to authenticate."
    }
    if (resp.status < 200 || resp.status >= 300) return { data: null, accessToken }
    return { data: ctx.util.tryParseJson(resp.bodyText), accessToken }
  }

  function fetchQuotaWithRetry(ctx, accessToken, projectId) {
    const body = projectId ? { project: projectId } : {}
    const resp = postJson(ctx, QUOTA_URL, accessToken, body)
    if (ctx.util.isAuthStatus(resp.status)) {
      throw "Gemini session expired. Run `gemini auth login` to authenticate."
    }
    if (resp.status < 200 || resp.status >= 300) {
      throw "Gemini quota request failed (HTTP " + String(resp.status) + "). Try again later."
    }
    return resp
  }

  function probe(ctx) {
    assertSupportedAuthType(ctx)

    const creds = loadOauthCreds(ctx)
    if (!creds) throw "Not logged in. Run `gemini auth login` to authenticate."

    let accessToken = creds.access_token
    if (needsRefresh(creds)) {
      ctx.host.log.warn("Gemini token is near expiry; OpenUsage will not refresh OAuth tokens in-app")
    }

    const idTokenPayload = decodeIdToken(ctx, creds.id_token)
    const loadCodeAssistResult = fetchLoadCodeAssist(ctx, accessToken)
    accessToken = loadCodeAssistResult.accessToken

    const tier = readFirstStringDeep(loadCodeAssistResult.data, ["tier", "userTier", "subscriptionTier"])
    const plan = mapTierToPlan(tier, idTokenPayload)

    const projectId = discoverProjectId(ctx, accessToken, loadCodeAssistResult.data)
    const quotaResp = fetchQuotaWithRetry(ctx, accessToken, projectId)
    const quotaData = ctx.util.tryParseJson(quotaResp.bodyText)
    if (!quotaData || typeof quotaData !== "object") {
      throw "Gemini quota response invalid. Try again later."
    }

    const lines = parseQuotaLines(ctx, quotaData)
    const email = idTokenPayload && typeof idTokenPayload.email === "string" ? idTokenPayload.email : null
    if (email) lines.push(ctx.line.text({ label: "Account", value: email }))
    if (!lines.length) lines.push(ctx.line.badge({ label: "Status", text: "No usage data", color: "#a3a3a3" }))

    return { plan: plan || undefined, lines }
  }

  globalThis.__openusage_plugin = { id: "gemini", probe }
})()
