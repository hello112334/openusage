# Gemini

Tracks Gemini CLI usage through local OAuth credentials and Gemini quota APIs.

## Data sources

- `~/.gemini/settings.json` for auth mode
- `~/.gemini/oauth_creds.json` for OAuth access token and account identity

## Supported auth modes

- `oauth-personal`
- missing auth type (treated as personal OAuth)

## Unsupported auth modes

- `api-key`
- `vertex-ai`

These return explicit errors.

## API endpoints

- `POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`
- `POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota`
- `GET https://cloudresourcemanager.googleapis.com/v1/projects` (project fallback)

## Output mapping

- **Plan** from `loadCodeAssist` tier:
  - `standard-tier` -> `Paid`
  - `free-tier` + `hd` claim -> `Workspace`
  - `free-tier` -> `Free`
  - `legacy-tier` -> `Legacy`
- **Pro**: lowest remaining Gemini Pro bucket
- **Flash**: lowest remaining Gemini Flash bucket
- **Account**: email from `id_token` claims

## Security note

OpenUsage intentionally does not read Gemini CLI OAuth client credentials or perform OAuth refresh inside this app. If the Gemini access token expires, rerun `gemini auth login`.
