# PipelineIQ API

Base URL: `http://localhost:5000/api`

## Conventions

- **Auth:** dashboard endpoints need `Authorization: Bearer <Supabase access token>`. The user comes from the verified token, never from the body.
- **Casing:** request bodies and query params use camelCase. Response bodies use snake_case, matching database columns.
- **Success:** `{ "data": ... }`
- **Error:** `{ "error": { "code": "bad_request", "message": "Validation failed", "details": [{ "path": "lineNumber", "message": "..." }] } }`

| Status | Meaning |
|---|---|
| 400 | Validation failed / malformed JSON / invalid id |
| 401 | Missing or invalid token, ingest key or signature |
| 403 | Authenticated but not allowed (e.g. monitoring disabled) |
| 404 | Not found, **or owned by someone else** (ownership is never revealed) |
| 409 | Conflict (e.g. GitHub issue creation already in progress) |
| 413 | Body too large |
| 503 | Integration not configured on the server (`code: "not_configured"`) |

---

## Health

### `GET /api/health`
No auth.
```json
{ "status": "ok", "timestamp": "…", "uptime": 12,
  "services": { "supabase": "configured", "redis": "up", "github": "not_configured",
                "githubWebhooks": "configured", "slack": "not_configured", "gemini": "configured" } }
```

---

## Errors

### `POST /api/errors`: SDK ingestion
Auth: header `X-PipelineIQ-Key: <repository ingest key>` (from the DSN). CORS accepts any origin for this route only (no cookies are used).

```json
{
  "projectId": "optional, reserved",
  "repositoryId": "uuid (required)",
  "errorType": "TypeError (required)",
  "message": "Cannot read properties of undefined (required, ≤5000)",
  "stackTrace": "… (≤50000)",
  "fileName": "Expense.jsx",
  "lineNumber": 47,
  "columnNumber": 12,
  "environment": "production (default)",
  "requestUrl": "https://…",
  "userAgent": "…",
  "timestamp": "ISO-8601 with offset (optional)",
  "metadata": { "any": "JSON ≤10KB" }
}
```
`202 Accepted`: `{ "data": { "accepted": true, "queued": true, "job_id": "…" } }`. If Redis is unavailable, the error is grouped inline and the response is `{ "accepted": true, "queued": false, "error_id": "…", "is_new": true }`.

Errors: `400` validation · `401` missing/invalid key or unknown repository (same response for both) · `403` monitoring disabled.

### `GET /api/errors`
Query (all optional): `repositoryId`, `status` (`open|resolved|ignored`), `severity` (`critical|high|medium|low`), `environment`, `search`, `sort` (`last_seen|occurrences|severity`), `limit` (1–200, default 100).

Returns error groups: `id, repository_id, error_type, message, file_name, line_number, severity, environment, occurrences, status, first_seen, last_seen, ai_status, repository { id, name, full_name }`.

### `GET /api/errors/stats`
Query: `repositoryId?`, `days?` (1–90, default 14).
```json
{ "repositories": 3, "total_errors": 12, "open_errors": 5, "critical_errors": 1,
  "total_occurrences": 431, "open_incidents": 2,
  "trend": [{ "date": "2026-09-30", "events": 17, "critical": 2 }] }
```

### `GET /api/errors/:id`
Full error row plus `repository`, `recent_events` (last 20 occurrences) and `incidents`. `ai_analysis` is one of:
```json
{ "status": "pending" }
{ "status": "completed", "severity": "critical", "rootCause": "…", "explanation": "…",
  "suggestedFix": "…", "affectedArea": "…", "model": "gemini-3.5-flash", "analyzedAt": "…" }
{ "status": "unavailable", "reason": "not_configured | request_failed | invalid_response | gemini_http_429", "analyzedAt": "…" }
```

### `PATCH /api/errors/:id/status`
Body `{ "status": "open" | "resolved" | "ignored" }`. Resolving or ignoring an error also closes its active incident and posts to the Slack thread.

---

## Repositories

### `GET /api/repositories`
Monitored repositories with `stats { total_errors, open_errors, open_critical, total_occurrences, last_error_at }`.

### `POST /api/repositories`
Body `{ "githubRepoId": 123456 }`. Starts monitoring a repository after the backend confirms that one of **your** GitHub App installations can access it. Returns `201` with the row.

### `GET /api/repositories/:id`
Includes `ingest_key`, which the dashboard uses to build the SDK DSN.

### `PATCH /api/repositories/:id`
Body `{ "monitoringEnabled": false }`

### `GET /api/repositories/:id/events`
Latest 20 GitHub webhook events: `event_type, action, title, status, ref, sha, actor, url, created_at`.

---

## Incidents

An incident is opened once per error group. This happens when a group is new, or regresses after being resolved, and has severity critical or high, or medium in production. Repeat occurrences never open another incident or send another alert.

### `GET /api/incidents`
Query: `status?` (`open|investigating|resolved|ignored`), `repositoryId?`, `limit?`. Each incident embeds `error { … }` and `repository { id, name, full_name, html_url }`.

### `GET /api/incidents/:id`

### `PATCH /api/incidents/:id/status`
Body `{ "status": "open" | "investigating" | "resolved" | "ignored" }`. Sets `resolved_at`, syncs the error group's status and posts an update or resolution into the Slack alert thread.

### `POST /api/incidents/:id/github-issue`
Creates a GitHub issue with the error, repository, occurrences, stack trace, AI diagnosis and suggested fix. It is idempotent: `201 { created: true, github_issue_number, github_issue_url }` the first time, then `200 { created: false, … }`. Concurrent requests get `409`. Closing the issue on GitHub resolves the incident, through the `issues` webhook.

## Push monitoring

Every push to a monitored repository is reviewed by Gemini, and every failed GitHub Actions run is diagnosed from its logs. When Gemini's search/replace edits all apply exactly, the fix is committed to a new `pipelineiq/fix-<sha>-<id>` branch and opened as a pull request against the pushed branch. The Slack alert links the PR. PipelineIQ never merges. Pushes to `pipelineiq/*` branches, bot pushes and commits containing `[skip pipelineiq]` are ignored. Push reviews alert only at ≥ 80% confidence and severity above low. A failed CI run is always alerted, even when Gemini is unavailable. Turn parts off with `PUSH_REVIEW=false` or `AUTO_FIX_PR=false`.

### `GET /api/pipeline-alerts`
Query: `status?` (`analyzing|no_issue|alerted|fix_proposed|resolved|dismissed|failed`), `repositoryId?`, `includeClean?` (include pushes with no issue), `limit?`. Each alert has `source` (`ci_failure|diff_review`), branch, commit, workflow and run links, `analysis { rootCause, explanation, suggestedFix, severity, confidence, edits, model }`, `fix_pr_number`, `fix_pr_url`, `fix_note` (why no PR), and `repository { … }`.

### `PATCH /api/pipeline-alerts/:id/status`
Body `{ "status": "resolved" | "dismissed" | "alerted" }`. Merging the fix PR on GitHub resolves the alert automatically (`pull_request.closed` webhook) and posts in the Slack thread.

---

## GitHub

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/github/connect` | Bearer | `{ url }`: GitHub App install URL with signed, expiring `state`. The browser navigates to it |
| `GET /api/github/callback` | `state` | GitHub redirect target. Exchanges `code`, verifies via `/user/installations` that the user can access the installation, stores it, then redirects to `/integrations?github=connected\|error` |
| `GET /api/github/status` | Bearer | `{ configured, connected, installations: [{ installation_id, account_login, account_type, created_at }] }` |
| `GET /api/github/repositories` | Bearer | Repositories accessible to your installations, with `monitored` and `repository_id` flags |
| `GET /api/github/repositories/:repoId` | Bearer | One repository by GitHub numeric id (404 if your installations can't access it) |

## Webhooks

### `POST /api/webhooks/github`
Verified with `X-Hub-Signature-256` (HMAC-SHA256 of the **raw** body using `GITHUB_WEBHOOK_SECRET`, compared in constant time). Invalid or missing signatures get `401` and the payload is never processed.

Handled events: `push`, `pull_request`, `workflow_run`, `deployment`, `deployment_status`, `issues` are stored per monitored repository and are idempotent on `X-GitHub-Delivery`. `issues.closed` resolves incidents linked to that issue. `push` and failed `workflow_run` events start push monitoring (above); merging a `pipelineiq/fix-*` pull request resolves its alert. `installation.deleted` removes the installation and pauses its repositories. `ping` is acknowledged. Response: `202`.

## Slack

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/slack/connect` | Bearer | `{ url }`: Slack OAuth v2 authorize URL (signed `state`) |
| `GET /api/slack/callback` | `state` | Exchanges the code, stores workspace and channel with the bot token **encrypted** (AES-256-GCM), then redirects to `/integrations?slack=connected\|error\|cancelled` |
| `GET /api/slack/status` | Bearer | `{ configured, connected, workspace_name, channel_name, connected_at }`. The token is never returned |
| `DELETE /api/slack/disconnect` | Bearer | Revokes the token and deletes the integration. `204` |
| `POST /api/slack/test` | Bearer | Sends a test message to the connected channel |
| `POST /api/slack/interactions` | Slack signature | Button clicks from alerts. Verified with `X-Slack-Signature` and a 5-minute timestamp window. "Create GitHub Issue" is queued on `github-issue` |
