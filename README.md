# PipelineIQ

> AI-powered error and incident monitoring for GitHub repositories.

PipelineIQ captures errors from your apps using a small JavaScript SDK. It groups duplicate errors by fingerprint, asks Google Gemini for a root-cause diagnosis, opens an incident and posts one Slack alert per problem, not one per occurrence. You can then create a GitHub issue from the incident in one click. GitHub webhooks (pushes, PRs, workflow runs, deployments, issues) show up next to your errors, and closing the linked GitHub issue resolves the incident.

```
 your app ──SDK──▶ POST /api/errors ──▶ Redis queue ──▶ worker
                                                     │ fingerprint + group (Postgres, atomic)
                                                     │ new group? → Gemini analysis
                                                     │           → incident → Slack alert
 GitHub ──webhook (HMAC-verified)──▶ /api/webhooks/github ──▶ activity feed / auto-resolve
 dashboard (React) ──Supabase JWT──▶ /api/* (RLS-scoped queries)
```

> **Setting up from scratch?** Follow [docs/SETUP.md](docs/SETUP.md): every account, permission, URL and environment variable, step by step, with troubleshooting.

## Is it working? Five levels of checks

| Level | Needs | Command / where | You should see |
|---|---|---|---|
| **1. Demo UI** | nothing | `cd frontend; npm run demo` | Browser opens at http://localhost:5180. Sign in with any email and password to explore every page with sample data |
| **2. Backend tests** | nothing | `cd backend; npm test` | `Tests: 114 passed` |
| **3. Credentials** | `backend/.env` filled in | `cd backend; npm run check-env` | Each service ✔, or ✘ with the exact fix |
| **4. Backend health** | backend running | `Invoke-RestMethod http://localhost:5000/api/health` | `status: ok`, plus each service marked `configured` / `not_configured`, and Redis `up` / `down` |
| **5. Live system** | Supabase configured | Sign in, open **Dashboard** or **Integrations** | The **System status** pipeline: green = working, amber = credentials missing, red = unreachable. The navbar pill says **API online / offline** and re-checks every 30 seconds |

End-to-end: add a repository, copy its DSN from **Repository → SDK setup**, send an error (see [Send your first error](#send-your-first-error)), and within seconds it appears under **Errors**. With the worker, Gemini and Slack configured, it also gets an AI diagnosis, an incident and a Slack alert.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, JavaScript (JSX), Tailwind CSS v4, React Router, Axios, Recharts, Lucide |
| Backend | Node.js 20+, Express 5, JavaScript (ES modules), Zod validation |
| Database & auth | Supabase PostgreSQL + Supabase Auth, Row Level Security |
| Background jobs | Redis + BullMQ (`error-processing`, `ai-analysis`, `slack-notification`, `github-issue`) |
| Integrations | GitHub App (REST API + webhooks), Slack OAuth + Block Kit, Gemini API |
| Tests | Jest + Supertest (all external services mocked) |

## Folder structure

```
├── frontend/            React + Vite dashboard
│   ├── demo/            `npm run demo`: mock backend + sample data (no credentials needed)
│   └── src/
│       ├── components/  layout/ (Sidebar, Navbar) and ui/ (cards, badges, charts…)
│       ├── layouts/     DashboardLayout (auth guard + sidebar + navbar + content)
│       ├── pages/       one file per route
│       ├── services/    API calls, one module per backend resource
│       ├── hooks/       useApi, useAuth, useTheme
│       ├── context/     AuthProvider (Supabase session), ThemeProvider
│       ├── lib/         supabase client, axios client, cn()
│       └── utils/       formatting helpers
├── backend/             Express API + BullMQ workers
│   └── src/
│       ├── config/      env.js (all environment variables, feature flags)
│       ├── routes/      URL → middleware → controller
│       ├── controllers/ HTTP in/out, request schemas
│       ├── services/    business logic (GitHub, Slack, Gemini, grouping, incidents)
│       ├── middleware/  auth, validation, webhook signatures, error handler
│       ├── workers/     queue.js (producers), errorWorker.js (worker process)
│       ├── supabase/    client.js (anon / per-user RLS), adminClient.js (service role)
│       └── utils/       logger, crypto, secret redaction
├── sdk/javascript/      @pipelineiq/sdk (browser + Node)
├── supabase/migrations/ SQL schema, RLS policies, functions
└── docs/                SETUP.md, ARCHITECTURE.md, API.md, PROJECT-AUDIT.md
```

## Prerequisites

- Node.js 20 or newer (`node -v`)
- A Supabase project (free tier is fine)
- Redis 6.2+ for background jobs (see [Running Redis](#running-redis))

## Install

```powershell
cd frontend; npm install; cd ..
cd backend; npm install; cd ..
```

## Configure environment variables

Everything lives in **one file**, `backend/.env`:

```powershell
Copy-Item backend.env.example backend.env
```

Fill in what you have. Every variable is explained in [`backend/.env.example`](backend/.env.example), and each integration turns on as soon as its values are set. The code handles the fiddly parts:

- **GitHub private key:** drop the downloaded `.pem` file into `backend/` and leave the key variables empty. A path, the raw PEM (multi-line or with `
`) or base64 also work.
- **`APP_ENCRYPTION_KEY`:** leave it empty in development. One is generated and saved to `.env` on first start.
- **Redirect URIs:** derived from `PUBLIC_API_URL`, so set that once (to your tunnel URL for Slack) instead of each URI.
- **Frontend:** reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `backend/.env`. `frontend/.env` is only needed to override them.
- **Gemini:** if the configured model is retired or overloaded, it falls back to `gemini-flash-latest`.

Then verify every credential against the live services:

```powershell
cd backend
npm run check-env   # each service ✔/✘, with the exact fix and the URLs to register
npm run simulate    # runs the full pipeline (grouping, Gemini, Slack + GitHub previews) without writing anything
```

The API also prints a configuration summary when it starts.

> Never put `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_CLIENT_SECRET`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` or `GEMINI_API_KEY` in the frontend. `.env` files are git-ignored.

## Set up the database (Supabase)

Apply the migrations in `supabase/migrations/` **in filename order**. Use either option:

- **Dashboard:** Supabase → SQL Editor → paste and run each file in order.
- **CLI:**
  ```powershell
  npx supabase login
  npx supabase link --project-ref <your-project-ref>
  npx supabase db push
  ```

Then in Supabase → Authentication:
- **Providers → Email**: enabled (the default).
- **URL Configuration**: Site URL `http://localhost:5173`, and add `http://localhost:5173/**` to Redirect URLs.
- *(Optional)* **Providers → GitHub** if you want the "Continue with GitHub" sign-in button. This needs a separate GitHub OAuth App whose callback is `https://<project>.supabase.co/auth/v1/callback`. It is independent of the PipelineIQ GitHub App below.

## Run the frontend

```powershell
cd frontend
npm run dev
```

Open http://localhost:5173.

## Run the backend

```powershell
cd backend
npm run dev
```

The API runs on http://localhost:5000. Check it with:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

## Running Redis

BullMQ needs Redis 6.2+. Choose one of these on Windows:

- **Docker Desktop:** `docker run -d --name pipelineiq-redis -p 6379:6379 redis:7`
- **WSL (Ubuntu):** `sudo apt install redis-server`, then `sudo service redis-server start`
- **Memurai** (native Windows, Redis-compatible): install it, and it listens on 6379
- **Hosted** (e.g. Upstash): set `REDIS_URL=rediss://default:<password>@<host>:6379`

If Redis is down, the API still accepts errors and processes them in-process as a fallback. Run Redis in real deployments.

## Run the worker

The worker processes the queues (grouping, Gemini analysis, Slack alerts, GitHub issues). Run it in a second terminal:

```powershell
cd backend
npm run worker
```

## Run the tests

```powershell
cd backend
npm test
```

The tests use no network or credentials: Supabase, Redis, GitHub, Slack and Gemini are all mocked.

## Configure GitHub (GitHub App)

1. GitHub → Settings → Developer settings → **GitHub Apps → New GitHub App**.
2. **Callback URL**: `http://localhost:5000/api/github/callback` (this is also `GITHUB_REDIRECT_URI`).
3. Tick **"Request user authorization (OAuth) during installation"**. PipelineIQ uses this to verify that the installing user really has access to the installation.
4. **Webhook**: active. URL `https://<public-url>/api/webhooks/github`. For local development, use a tunnel such as `ngrok http 5000` or smee.io. Set a random **Webhook secret**: this is `GITHUB_WEBHOOK_SECRET`.
5. **Repository permissions**: Metadata (read), **Contents (read & write)**, Issues (read & write), **Pull requests (read & write)**, Actions (read), Deployments (read). Write access is what lets PipelineIQ open fix PRs. It never pushes to your existing branches.
6. **Subscribe to events**: Push, Pull request, Workflow run, Deployment, Deployment status, Issues.
7. After creating the app, copy the **App ID** and **Client ID**, generate a **client secret**, and generate a **private key** (`.pem`).
8. Put them in `backend/.env`. For `GITHUB_APP_PRIVATE_KEY`, paste the PEM on one line with `\n` for line breaks, or wrap it in double quotes across several lines.

In the dashboard: **Integrations → Connect GitHub**, install the app, then go to **Repositories → Add repository**.

### Push monitoring and fix PRs

Once the GitHub App, its webhook, Gemini and Slack are configured, every monitored repository gets:

1. **Push review.** Gemini reviews the changed code of each push and alerts only when it is confident there is a real bug.
2. **CI failure diagnosis.** When a GitHub Actions run fails, Gemini reads the failed job logs and the code they point at.
3. **A ready-to-merge fix PR.** The suggested fix is applied on a new `pipelineiq/fix-*` branch and opened as a pull request against the pushed branch. It is only opened when every edit applies exactly.
4. **A Slack alert** with the diagnosis, the suggested fix and a **Review Fix PR** button. Merging the PR resolves the alert and posts in the thread.

Alerts are listed on the **Push monitoring** page. Add `[skip pipelineiq]` to a commit message to skip it. Set `PUSH_REVIEW=false` (only CI failures) or `AUTO_FIX_PR=false` (alerts only, no PRs) in `backend/.env`. Run `npm run simulate` to watch both flows run against live Gemini without touching GitHub.

## Configure Slack

1. https://api.slack.com/apps → **Create New App → From scratch**.
2. **OAuth & Permissions**:
   - Redirect URL: `https://<public-url>/api/slack/callback`. Slack requires HTTPS, so use a tunnel locally. This is `SLACK_REDIRECT_URI`.
   - Bot token scopes: `chat:write`, `chat:write.public`, `incoming-webhook`.
3. **Interactivity & Shortcuts**: on. Request URL: `https://<public-url>/api/slack/interactions`. This makes the "Create GitHub Issue" alert button work.
4. **Basic Information**: copy the Client ID, Client Secret and Signing Secret into `backend/.env`.

In the dashboard: **Integrations → Connect Slack**, then choose the alert channel.

## Configure Gemini

1. Create an API key at https://aistudio.google.com/app/apikey.
2. Set `GEMINI_API_KEY` in `backend/.env`. `GEMINI_MODEL` is optional and defaults to `gemini-3.5-flash`.

Without a key, errors are still grouped and alerted. The diagnosis is marked "unavailable".

## Helpline (in-app help bot)

The round help button on every page answers questions about PipelineIQ only (sign-in required to get an answer). It uses intent classification (TF-IDF + logistic regression), knowledge from the Supabase table `helpline_knowledge`, and the same Gemini key. One-time setup: run `supabase/migrations/20261006000005_helpline_knowledge.sql`, then `npm run helpline:seed` in `backend/`. Evaluate it with `npm run helpline:eval`. See [docs/HELPLINE.md](docs/HELPLINE.md).

## Send your first error

Open a repository in the dashboard, copy the DSN from **SDK setup**, and:

```js
import PipelineIQ from '@pipelineiq/sdk'
PipelineIQ.init({ dsn: 'http://<ingestKey>@localhost:5000/<repositoryId>' })
PipelineIQ.captureException(new Error('Hello from PipelineIQ'))
```

See [sdk/javascript/README.md](sdk/javascript/README.md). The API is documented in [docs/API.md](docs/API.md) and the design in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
