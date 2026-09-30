# PipelineIQ backend

Express 5 API plus BullMQ workers. JavaScript ES modules, Node.js 20+.

```powershell
npm install
Copy-Item .env.example .env   # fill in values; everything is optional in development
npm run dev                   # API on http://localhost:5000 (auto-restart on change)
npm run worker                # queue worker (separate terminal; needs Redis)
npm test                      # Jest, no credentials or network needed
```

## Layout

| Folder | Responsibility |
|---|---|
| `src/config/env.js` | Reads every environment variable once and exposes `features.*` flags |
| `src/routes/` | Maps URLs to middleware and controllers. No logic here |
| `src/controllers/` | Request schemas (Zod) and HTTP responses (`{ data }` / `{ error }`) |
| `src/services/` | Business logic, split by domain |
| `src/middleware/` | `requireAuth` (Supabase JWT), `requireIngestKey` (SDK), `validate`, webhook signatures, error handler |
| `src/workers/` | `queue.js` producers and `errorWorker.js` worker process |
| `src/supabase/` | `client.js` (anon + per-request user client, RLS applies) and `adminClient.js` (service role) |
| `src/utils/` | Logger with secret redaction, crypto helpers (HMAC, AES-GCM, OAuth state, GitHub App JWT) |

## Conventions

- Request bodies and query params use **camelCase**. Response bodies use **snake_case**, matching the database columns, and are wrapped as `{ "data": ... }`.
- Errors are always `{ "error": { "code", "message", "details?" } }` with a meaningful HTTP status.
- User-facing reads and writes go through `req.db`, a Supabase client that acts as the signed-in user, so Row Level Security applies as a second line of defense. The service-role client is only used for ingestion, webhooks, workers and integration tokens.
- The user identity always comes from the verified token (`req.user`), never from the request body.

See [../docs/API.md](../docs/API.md) for every endpoint.
