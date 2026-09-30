# Architecture

## Components

```
┌──────────────┐  Supabase Auth (email / GitHub)   ┌──────────────────────────┐
│  Frontend    │◀─────────────────────────────────▶│  Supabase                 │
│  React/Vite  │                                   │  • Auth (JWT)             │
│              │── Bearer JWT ──▶ ┌────────────┐   │  • Postgres + RLS         │
└──────────────┘                  │  API       │──▶│  • ingest_error() RPC     │
                                  │  Express   │   └──────────────────────────┘
┌──────────────┐ X-PipelineIQ-Key│           │        ▲
│  Your app    │──── POST ────────▶│           │        │ service role
│  + SDK       │  /api/errors      └─────┬──────┘        │
└──────────────┘                         │ enqueue       │
                                         ▼               │
┌──────────────┐  signed webhook   ┌────────────┐  ┌────┴──────┐
│  GitHub      │──────────────────▶│ Redis      │─▶│ Worker    │──▶ Gemini API
│  (App)       │◀── issues API ────│ (BullMQ)   │  │ BullMQ    │──▶ Slack API
└──────────────┘                   └────────────┘  └───────────┘──▶ GitHub API
```

- **Frontend** only ever holds the Supabase **anon** key and the user's session. All data comes from the PipelineIQ API through `src/services/*`, which use Axios with the session token attached.
- **API** does validation, authentication and fast database work, and never waits on AI, Slack or GitHub calls from the ingestion path.
- **Worker** (`npm run worker`) runs the four queues. If Redis is unavailable, the API runs the same functions in-process as a fallback, so errors are not dropped.

## Error pipeline

1. **SDK** (`@pipelineiq/sdk`) posts an event with the repository's ingest key from the DSN.
2. **`requireIngestKey`** looks the repository up with the service role and compares keys in constant time. Unknown repositories and wrong keys return the same 401.
3. The event is queued on **`error-processing`** and the API answers `202`.
4. **`errorService.ingestError`**:
   - computes a SHA-256 **fingerprint** of `repository | errorType | normalized message | normalized file | line`. The message is normalized by replacing uuids, numbers, hex ids, urls, emails and timestamps. The file is normalized by stripping origins, query strings and bundler hashes. Timestamps are never part of it.
   - calls the Postgres function **`ingest_error`**, which in one transaction either increments `occurrences` and `last_seen` on the existing group or inserts a new one, and always inserts an `error_events` row. It returns `is_new` / `is_regression`. It is race-safe: 40 concurrent first occurrences produce one group with `occurrences = 40` and a single `is_new`.
   - only when the group is **new or regressed** (a resolved error came back), queues **`ai-analysis`**. Repeats stop here, so 100 identical errors produce one analysis and one alert.
5. **`errorService.analyzeAndAlert`** (ai-analysis job):
   - **`aiService.analyzeError`** sends Gemini only debugging fields: type, message, file, line, environment, path without query string, and a truncated stack. Credentials are redacted first (JWTs, GitHub, Slack and Google keys, PEM blocks, `password=`/`token=` pairs, URL credentials). Metadata and user agents are never sent. The JSON reply is validated with Zod. Any failure is stored as `{ status: "unavailable", reason }`. It never throws.
   - The AI severity replaces the rule-based estimate when available.
   - If the group is open and severe enough, **`incidentService.openIncidentForError`** inserts an incident. A partial unique index guarantees at most one active incident per error.
   - A newly created incident queues **`slack-notification`** (`alert`).
6. **`slackService.sendErrorAlert`** posts a Block Kit message (repository, severity, error, file:line, occurrences, environment, AI diagnosis, suggested fix, and buttons for View Error, View GitHub and Create GitHub Issue). It stores `slack_message_ts` so later updates are threaded. Transient Slack errors throw so BullMQ retries 3 times with exponential backoff. Permanent ones (`channel_not_found`, `invalid_auth`…) are logged and dropped without affecting the incident.

## Incident lifecycle

`open → investigating → resolved | ignored`, changed from the dashboard, from the error page (resolving an error closes its incident), or by closing the linked GitHub issue (`issues.closed` webhook). Resolved groups that re-occur are **regressions**: the group reopens and a new incident and alert are created.

GitHub issue creation is **idempotent**. A short lock column (`github_issue_lock_at`) claimed with a conditional update prevents concurrent duplicates, and `github_issue_number` / `github_issue_url` are stored.

## Security model

| Concern | Mechanism |
|---|---|
| User auth | Supabase JWT verified server-side (`supabase.auth.getUser`). `req.user` comes only from the token |
| Data isolation | User requests run through a per-request Supabase client carrying the user's JWT, so **RLS** applies. Queries also scope by id, and a foreign row returns 404 |
| Least privilege in DB | `authenticated` can only UPDATE `repositories.monitoring_enabled`, `errors.status`, `incidents.status/resolved_at`. Inserts go through the backend after verification. `slack_integrations` has RLS with no policies (service role only). `ingest_error` is executable only by `service_role` |
| SDK ingestion | Per-repository random `ingest_key` (DSN), constant-time comparison, body limits, Zod validation |
| GitHub webhooks | HMAC-SHA256 over the raw body, constant-time compare, rejected before parsing |
| Slack interactivity | `v0` HMAC signature and a 5-minute replay window. The workspace must match the incident owner's integration |
| OAuth flows | HMAC-signed, expiring `state` binds the callback to the user who started it. GitHub installation ownership is re-verified with the user's OAuth token |
| Secrets at rest | Slack bot tokens encrypted with AES-256-GCM (`APP_ENCRYPTION_KEY`). No tokens are returned by the API |
| Secrets in transit to third parties | Redaction before Gemini and Slack. Logs are redacted too |
| CORS | Dashboard API: only `FRONTEND_URL`. Ingestion route: reflects the origin (no credentials) because SDKs run on customer domains |
| Headers | `helmet`, `x-powered-by` disabled |

## Data model

See `supabase/migrations/`. Main tables: `github_installations`, `repositories` (+ `installation_id`, `ingest_key`), `errors` (one row per fingerprint, unique `(repository_id, fingerprint)`), `error_events` (one row per occurrence), `incidents`, `slack_integrations`, `github_events`. There is also the view `repository_error_stats` and the functions `ingest_error()` and `error_trend()`.

## Frontend structure

- `layouts/DashboardLayout.jsx` is the auth guard (redirects to `/login`) plus a collapsible sidebar (an off-canvas drawer on mobile), the navbar and an `<Outlet/>`.
- `pages/*` hold one component per route. Authenticated pages are lazy-loaded.
- `services/*` hold thin API wrappers that return `response.data.data`. `lib/api.js` attaches the token and normalizes errors.
- `hooks/useApi.js` gives each page loading, error and reload state. `hooks/useAuth.js` and `hooks/useTheme.js` read the contexts.
- Naming: PascalCase components (`.jsx`), camelCase functions and modules (`.js`).
