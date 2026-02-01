# Claude Code Usage API

Claude Code uses Anthropic's OAuth-based API to fetch usage data. The usage endpoint returns rate limit windows and optional extra credits information as JSON.

**Note:** This is a reverse-engineered, undocumented API. It may change without notice.

## Endpoint

```
GET https://api.anthropic.com/api/oauth/usage
```

### Required Headers

```
Authorization: Bearer <access_token>
Accept: application/json
Content-Type: application/json
anthropic-beta: oauth-2025-04-20
```

### Response

```jsonc
{
  "five_hour": {
    "utilization": 25,              // % used in 5h rolling window
    "resets_at": "2026-01-28T15:00:00Z"
  },
  "seven_day": {
    "utilization": 40,              // % used in 7-day window
    "resets_at": "2026-02-01T00:00:00Z"
  },
  "seven_day_opus": {               // separate weekly limit for Opus (optional)
    "utilization": 0,
    "resets_at": "2026-02-01T00:00:00Z"
  },
  "extra_usage": {                  // on-demand / overage credits (optional)
    "is_enabled": true,
    "used_credits": 500,            // cents -- amount spent
    "monthly_limit": 10000,         // cents -- monthly cap
    "currency": "USD"
  }
}
```

#### Rate Limit Windows

The API tracks multiple concurrent usage windows:

| Window | Field | Duration | Description |
|---|---|---|---|
| **Primary** | `five_hour` | 5 hours | Short-term rolling limit. Resets continuously |
| **Secondary** | `seven_day` | 7 days | Weekly rolling limit. Resets continuously |
| **Opus** | `seven_day_opus` | 7 days | Separate weekly limit for Claude Opus model (when present) |

All windows are enforced simultaneously -- hitting any limit throttles the user.

#### extra_usage: On-Demand Credits

Optional object for on-demand overage spending. Fields:

| Field | Type | Description |
|---|---|---|
| `is_enabled` | boolean | Whether on-demand credits are active |
| `used_credits` | number | Amount spent in cents |
| `monthly_limit` | number | Monthly cap in cents (0 = unlimited) |
| `currency` | string | Currency code (e.g. "USD") |

## Authentication

Claude Code uses OAuth tokens issued by Anthropic's auth system.

### Token Locations (macOS)

**Primary: Credentials file**

```
~/.claude/.credentials.json
```

File structure:

```jsonc
{
  "claudeAiOauth": {
    "accessToken": "<jwt>",          // OAuth access token (Bearer)
    "refreshToken": "<token>",       // used to obtain new access tokens
    "expiresAt": 1738300000000,      // unix ms -- token expiration
    "scopes": ["..."],               // granted OAuth scopes
    "subscriptionType": "pro",       // plan tier
    "rateLimitTier": "..."           // rate limit tier
  }
}
```

**Fallback: macOS Keychain**

Service name: `Claude Code-credentials`

The keychain entry contains the same JSON structure as the credentials file.

### Token Refresh

Access tokens are short-lived JWTs. The `expiresAt` field indicates when the token expires (unix milliseconds). If expired, Claude Code will automatically refresh using the `refreshToken`.

## Usage Example (curl)

```bash
ACCESS_TOKEN=$(python3 -c "import json; print(json.load(open('$HOME/.claude/.credentials.json'))['claudeAiOauth']['accessToken'])")

curl -s "https://api.anthropic.com/api/oauth/usage" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "anthropic-beta: oauth-2025-04-20" | python3 -m json.tool
```

## Usage Example (TypeScript)

```typescript
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

interface ClaudeOAuth {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  subscriptionType?: string;
}

interface UsageWindow {
  utilization: number;
  resets_at?: string;
}

interface UsageResponse {
  five_hour?: UsageWindow;
  seven_day?: UsageWindow;
  seven_day_opus?: UsageWindow;
  extra_usage?: {
    is_enabled?: boolean;
    used_credits?: number;
    monthly_limit?: number;
    currency?: string;
  };
}

function getClaudeCredentials(): ClaudeOAuth | null {
  const credPath = join(homedir(), ".claude", ".credentials.json");
  if (!existsSync(credPath)) return null;

  const data = JSON.parse(readFileSync(credPath, "utf-8"));
  return data.claudeAiOauth ?? null;
}

async function getClaudeUsage(): Promise<UsageResponse> {
  const creds = getClaudeCredentials();
  if (!creds?.accessToken) throw new Error("Claude credentials not found");

  const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "anthropic-beta": "oauth-2025-04-20",
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
```

## Technical Details

- **Protocol:** REST (plain JSON)
- **HTTP method:** GET
- **Base domain:** `api.anthropic.com`
- **Beta header:** `anthropic-beta: oauth-2025-04-20` (required)
- **Utilization is a percentage** (0-100)
- **Credits are in cents** (divide by 100 for dollars)
- **Timestamps are ISO 8601** (not unix)
- **Expiration times are unix milliseconds** (in credentials file)

## Open Questions

- [ ] What OAuth refresh endpoint does Claude Code use?
- [ ] Is `seven_day_opus` always present, or only for certain plans?
- [ ] Are there additional rate limit windows for different plan tiers (e.g. Max)?
- [ ] What scopes are required for the usage endpoint?
