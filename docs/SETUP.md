# PipelineIQ setup guide

Everything you need to configure to run PipelineIQ end to end: connect a GitHub repository and a Slack channel, then on every push Gemini looks for errors, alerts Slack with a suggested fix and opens a ready-to-merge fix PR.

Follow the sections in order. Each one says exactly which values go into `backend/.env`. When you're done, `npm run check-env` verifies every value against the live services and prints the exact fix for anything that is wrong.

| # | Step | Time | Needed for |
|---|---|---|---|
| 1 | [Prerequisites](#1-prerequisites) | 5 min | everything |
| 2 | [Public URL (ngrok)](#2-public-url-ngrok) | 5 min | GitHub webhooks, Slack |
| 3 | [Supabase](#3-supabase-database--login) | 10 min | everything |
| 4 | [GitHub App](#4-github-app) | 15 min | repositories, push monitoring, fix PRs |
| 5 | [Slack app](#5-slack-app) | 10 min | alerts |
| 6 | [Gemini](#6-gemini) | 2 min | diagnosis and fixes |
| 7 | [Redis (optional)](#7-redis-optional) | 5 min | background jobs |
| 8 | [Start and verify](#8-start-and-verify) | 5 min | |
| 9 | [Connect in the app](#9-connect-in-the-app) | 5 min | |
| 10 | [End-to-end test](#10-end-to-end-test) | 5 min | |

Reference: [all environment variables](#environment-variable-reference) · [URLs to register](#urls-to-register) · [what changed in this version](#changes-in-this-version) · [production](#production-deployment) · [troubleshooting](#troubleshooting)

---

## 1. Prerequisites

- **Node.js 20 or newer** (`node -v`)
- Accounts: **GitHub**, **Supabase**, **Slack** (a workspace where you can install apps), **Google AI Studio**, **ngrok**
- Install the dependencies:

```bash
cd frontend && npm install && cd ../backend && npm install
```

- Create the config file. This is the **only** file you need to fill in:

```bash
cp backend/.env.example backend/.env
```

`frontend/.env` is optional. The frontend reads the public Supabase values from `backend/.env`.

---

## 2. Public URL (ngrok)

GitHub must be able to deliver push and CI events to your API, and Slack only accepts `https` redirect URLs. Both need a public https address that forwards to `localhost:5000`.

1. Sign up at https://ngrok.com, install it and run the `ngrok config add-authtoken …` command shown in your dashboard.
2. Dashboard → **Domains** → claim your **free static domain** (e.g. `yourname.ngrok-free.app`). A static domain means the URLs below never change.
3. Keep this running whenever you work on PipelineIQ:

```bash
ngrok http 5000 --url=yourname.ngrok-free.app
```

4. In `backend/.env`:

```env
PUBLIC_API_URL=https://yourname.ngrok-free.app
```

Every callback, redirect and webhook URL is derived from `PUBLIC_API_URL`. The backend prints the full list when it starts (also in [URLs to register](#urls-to-register)).

> Without a tunnel the app still runs: login, dashboards, SDK errors and `npm run simulate` all work. Only GitHub webhooks (push monitoring) and Slack connection need it.

---



## 4. GitHub App

PipelineIQ uses a **GitHub App** (not an OAuth App) to read code and CI logs, receive push events and open fix PRs.

### 4.1 Create the app

GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**. For an organisation, do this under the organisation's settings instead.

| Field | Value |
|---|---|
| GitHub App name | anything unique, e.g. `pipelineiq-yourname` |
| Homepage URL | `http://localhost:5173` |
| **Callback URL** | `<PUBLIC_API_URL>/api/github/callback`, e.g. `https://yourname.ngrok-free.app/api/github/callback` |
| **Request user authorization (OAuth) during installation** | ✅ **tick it** (required: PipelineIQ uses it to verify who installed the app) |
| Setup URL | leave empty |
| **Webhook → Active** | ✅ |
| **Webhook URL** | `<PUBLIC_API_URL>/api/webhooks/github` |
| **Webhook secret** | a random string (generate one below). Keep it for `.env` |
| Where can this app be installed? | Only on this account (or Any account) |

Generate the webhook secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4.2 Permissions (Permissions & events tab)

**Repository permissions:**

| Permission | Access | Why |
|---|---|---|
| Metadata | Read-only | required by GitHub |
| **Contents** | **Read and write** | read the code; **create the fix branch and commit** |
| **Pull requests** | **Read and write** | **open the fix PR** |
| Actions | Read-only | read failed CI job logs |
| Issues | Read and write | "Create GitHub issue" for runtime errors |
| Deployments | Read-only | deployment activity feed |

PipelineIQ never pushes to your existing branches. It only creates new `pipelineiq/fix-*` branches.

**Subscribe to events:** ✅ Push · ✅ Workflow run · ✅ Pull request · ✅ Issues · ✅ Deployment · ✅ Deployment status

Click **Create GitHub App**.

### 4.3 Credentials

On the app's **General** page:

| GitHub shows | `backend/.env` |
|---|---|
| App ID (a number) | `GITHUB_APP_ID=` |
| Client ID (starts with `Iv`) | `GITHUB_CLIENT_ID=` |
| **Generate a new client secret** (shown once) | `GITHUB_CLIENT_SECRET=` |
| Webhook secret from 4.1 | `GITHUB_WEBHOOK_SECRET=` |

**Private key:** scroll down → **Generate a private key**. A `.pem` file downloads. Generate it **once**.

- Easiest: move the `.pem` file into `backend/` and leave `GITHUB_APP_PRIVATE_KEY` empty. It is detected automatically.
- Or `GITHUB_APP_PRIVATE_KEY_PATH=github-app.pem`, or paste the key into `GITHUB_APP_PRIVATE_KEY="…"` (multi-line, `\n`-escaped or base64 all work).

`*.pem` files are git-ignored. If several are in `backend/`, the newest is used and a warning is printed. Delete old keys both locally and on GitHub.

### 4.4 Changing permissions on an existing app

If the app already existed and you just added Contents/Pull requests **write**: GitHub asks every installation owner to **accept the new permissions**. Open **GitHub → Settings → Applications → Installed GitHub Apps → your app** and click **Review request / Accept**. Until then, fix PRs fail with `403 Resource not accessible by integration`.

### 4.5 Repository requirements

- **CI failure analysis** needs GitHub Actions workflows in the repository. Push review works without CI.
- Branch protection rules are fine: the fix PR targets the pushed branch and goes through your normal review and checks.

---

## 5. Slack app

1. https://api.slack.com/apps → **Create New App → From scratch** → name it and choose your workspace.
2. **OAuth & Permissions**
   - **Redirect URLs** → add `<PUBLIC_API_URL>/api/slack/callback` → **Save URLs**
   - **Bot Token Scopes** → add `chat:write`, `chat:write.public`, `incoming-webhook`
3. **Interactivity & Shortcuts** → On → Request URL `<PUBLIC_API_URL>/api/slack/interactions` → **Save**. This powers the "Create GitHub Issue" button. Link buttons such as "Review Fix PR" work without it.
4. **Basic Information → App Credentials**:

```env
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=
```

You don't install the app from Slack's page. You connect it from PipelineIQ ([step 9](#9-connect-in-the-app)), where you choose the alert channel. For a **private** channel, invite the app to the channel first (`/invite @YourApp`).

---

## 6. Gemini

1. https://aistudio.google.com/app/apikey → **Create API key**.
2. In `backend/.env`:

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
```

If the configured model is retired (404) or overloaded (503/429), PipelineIQ retries and then falls back to `gemini-flash-latest` and `gemini-flash-lite-latest` automatically. A failed CI run is still alerted even if every model is down.

---

## 7. Redis (optional)

Without Redis, background jobs (AI analysis, Slack, PRs) run inside the API process. That's fine for development. For reliable retries, run Redis 6.2+ and the worker:

```bash
docker run -d --name pipelineiq-redis -p 6379:6379 redis:7
```

```env
REDIS_URL=redis://localhost:6379
```

Then run `npm run worker` in a second terminal (in `backend/`).

---

## 8. Start and verify

```bash
cd backend
npm run check-env
```

Every line should be ✔. Each ✘ comes with the exact fix (wrong key, missing table, callback URL not registered, missing GitHub permission, …). `!` lines are working with a limitation.

```bash
npm run simulate
```

This runs the whole pipeline against live Gemini without writing anything or contacting GitHub/Slack: error grouping, AI diagnosis, a failed CI run and a buggy push, with the fix applied to the code and previews of the Slack alert and fix PR. The report is `backend/simulation-output/report.html`.

Start the app (three terminals):

```bash
ngrok http 5000 --url=yourname.ngrok-free.app
```

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

On startup the backend prints which features are on, any configuration problems, and the URLs to register.

`APP_ENCRYPTION_KEY` is generated and saved to `.env` on the first start. Don't change it afterwards: it encrypts the stored Slack token.

---

## 9. Connect in the app

Open http://localhost:5173:

1. **Sign up** and sign in.
2. **Integrations → Connect GitHub** → choose the account and repositories → **Install & Authorize**. You return to PipelineIQ with GitHub connected.
3. **Repositories → Add repository** → pick the repositories to monitor.
4. **Integrations → Connect Slack** → choose the alert channel → **Allow**. Then click **Send test alert** and check the channel.

---

## 10. End-to-end test

**Push review:** push a commit with an obvious bug to a monitored repository, e.g. import a function name that doesn't exist:

```js
import { formatCurrncy } from './format.js'   // the real export is formatCurrency
```

**CI failure:** push a commit that makes a GitHub Actions test fail.

Within about a minute:

- **Slack:** an alert with the diagnosis, suggested fix and a **Review Fix PR** button
- **GitHub:** a PR from `pipelineiq/fix-<sha>-<id>` into your branch, with the explanation and the change
- **PipelineIQ → Push monitoring:** the alert with status **Fix PR ready**
- **Merge the PR:** the alert becomes **Resolved** and Slack gets a "✅ Fix PR merged" reply in the thread

To skip a commit, add `[skip pipelineiq]` to its message.

**Runtime errors (SDK):** open a repository → **SDK setup** → copy the DSN and follow [sdk/javascript/README.md](../sdk/javascript/README.md).

---

## Environment variable reference

All in `backend/.env`. Only the Supabase values are strictly required to boot. Every integration switches on when its values are present.

| Variable | Required for | Where it comes from | Default |
|---|---|---|---|
| `NODE_ENV` | | `development` or `production` | `development` |
| `PORT` | | API port | `5000` |
| `FRONTEND_URL` | CORS, redirects | URL of the frontend (comma-separate several) | `http://localhost:5173` |
| `PUBLIC_API_URL` | GitHub webhooks, Slack | ngrok or production https URL of the API | `http://localhost:5000` |
| `SUPABASE_URL` | everything | Supabase → Project Settings → API | |
| `SUPABASE_ANON_KEY` | everything | anon / publishable key | |
| `SUPABASE_SERVICE_ROLE_KEY` | everything | service_role / secret key | |
| `GITHUB_APP_ID` | GitHub | GitHub App → General → App ID | |
| `GITHUB_CLIENT_ID` | GitHub | GitHub App → General → Client ID | |
| `GITHUB_CLIENT_SECRET` | GitHub | GitHub App → General → Generate client secret | |
| `GITHUB_WEBHOOK_SECRET` | push monitoring | the secret you set on the GitHub App webhook | |
| `GITHUB_APP_PRIVATE_KEY_PATH` / `GITHUB_APP_PRIVATE_KEY` | GitHub | the downloaded `.pem` (or drop it in `backend/`) | auto-detected |
| `GITHUB_REDIRECT_URI` | | override only | `<PUBLIC_API_URL>/api/github/callback` |
| `SLACK_CLIENT_ID` | Slack | Slack app → Basic Information | |
| `SLACK_CLIENT_SECRET` | Slack | Slack app → Basic Information | |
| `SLACK_SIGNING_SECRET` | Slack buttons | Slack app → Basic Information | |
| `SLACK_REDIRECT_URI` | | override only | `<PUBLIC_API_URL>/api/slack/callback` |
| `GEMINI_API_KEY` | AI diagnosis, push monitoring | Google AI Studio | |
| `GEMINI_MODEL` | | Gemini model id | `gemini-3.5-flash` |
| `PUSH_REVIEW` | | `false` = only analyse failed CI runs, don't review every push | `true` |
| `AUTO_FIX_PR` | | `false` = Slack alerts only, never open PRs | `true` |
| `REDIS_URL` | background jobs | Redis connection string | `redis://localhost:6379` |
| `APP_ENCRYPTION_KEY` | Slack, GitHub | random, 32+ chars | generated in development |

Optional `frontend/.env` (only to override): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`. These end up in the browser, so they must never hold secrets.

**Push monitoring is on** when the GitHub App, `GITHUB_WEBHOOK_SECRET`, Gemini and Supabase are all configured. The startup summary shows its state.

---

## URLs to register

Replace `<PUBLIC_API_URL>` with your ngrok or production URL. The backend prints these with your real values on startup and in `npm run check-env`.

| Where | Setting | URL |
|---|---|---|
| GitHub App → General | Callback URL | `<PUBLIC_API_URL>/api/github/callback` |
| GitHub App → General | Webhook URL | `<PUBLIC_API_URL>/api/webhooks/github` |
| Slack app → OAuth & Permissions | Redirect URL | `<PUBLIC_API_URL>/api/slack/callback` |
| Slack app → Interactivity & Shortcuts | Request URL | `<PUBLIC_API_URL>/api/slack/interactions` |
| Supabase → Authentication → URL Configuration | Site URL / Redirect URLs | `<FRONTEND_URL>` and `<FRONTEND_URL>/**` |

---

## Changes in this version

What changed for anyone upgrading an existing setup.

### Configuration

| Change | Action needed |
|---|---|
| New `PUBLIC_API_URL`. GitHub and Slack redirect URIs are derived from it | Set it to your tunnel/production URL. `GITHUB_REDIRECT_URI`/`SLACK_REDIRECT_URI` can be removed unless you need an override |
| New `PUSH_REVIEW`, `AUTO_FIX_PR` | Optional, both default to `true` |
| `GEMINI_MODEL` default is now `gemini-3.5-flash` (`gemini-2.5-flash` is no longer available to new keys) | Update `.env` if it still says `gemini-2.5-flash` |
| GitHub private key accepted as a file in `backend/`, a path, PEM or base64 | None |
| `APP_ENCRYPTION_KEY` generated automatically in development | None. Keep the existing value if you have one |
| Frontend reads Supabase values from `backend/.env` | `frontend/.env` can be deleted |

### GitHub App

| Change | Action needed |
|---|---|
| **Contents: Read and write** (was Read-only) | Update the permission, then accept it on each installation ([4.4](#44-changing-permissions-on-an-existing-app)) |
| **Pull requests: Read and write** (was Read-only) | Same as above |
| Events **Push**, **Workflow run**, **Pull request** now drive push monitoring | Make sure they are subscribed |

### Database

| Change | Action needed |
|---|---|
| New table `pipeline_alerts` (with RLS) | Run `supabase/migrations/20261002000004_pipeline_alerts.sql` in the SQL Editor (already included in `setup_all.sql`) |

### API

| Endpoint | Change |
|---|---|
| `GET /api/pipeline-alerts` | **New.** Lists CI failures and push-review findings with diagnosis and fix PR. Query: `status`, `repositoryId`, `includeClean`, `limit` |
| `PATCH /api/pipeline-alerts/:id/status` | **New.** Body `{ "status": "resolved" \| "dismissed" \| "alerted" }` |
| `POST /api/webhooks/github` | `push` and failed `workflow_run` events now start push monitoring. Merging a `pipelineiq/fix-*` PR resolves its alert. The response includes `pipeline: { queued \| skipped }` |
| Incident titles, Slack alerts, GitHub issues | Show `assets/Expense.js:47` instead of the full URL with query string |
| Error grouping | Numbers with units (`4321ms`, `512MB`) are normalised, so they no longer split one bug into many groups |

Full API reference: [API.md](API.md).

### Background jobs

New queue `pipeline-analysis` (handled by `npm run worker`, or in-process without Redis).

### New commands (in `backend/`)

| Command | What it does |
|---|---|
| `npm run check-env` | Tests every credential against the live services and prints the fix for each problem |
| `npm run simulate` | Runs the full pipeline with live Gemini, read-only, and writes an HTML report |

### Frontend

New **Push monitoring** page (`/pipeline`) in the sidebar. `npm run demo` includes sample push-monitoring alerts.

---

## Production deployment

| Item | Setting |
|---|---|
| `NODE_ENV` | `production`: the API refuses to start if Supabase, `APP_ENCRYPTION_KEY` (32+ chars) or an https `FRONTEND_URL` is missing |
| `PUBLIC_API_URL` | your API's https domain, e.g. `https://api.pipelineiq.example.com` |
| `FRONTEND_URL` | your frontend's https domain |
| `APP_ENCRYPTION_KEY` | set explicitly. It is **not** generated in production. Keep the same value forever |
| GitHub private key | `GITHUB_APP_PRIVATE_KEY` (base64 is easiest in hosting dashboards) or `GITHUB_APP_PRIVATE_KEY_PATH`. Auto-detection is development-only |
| Redis | required. Run `npm run worker` as a separate process |
| GitHub App / Slack app | replace every URL in [URLs to register](#urls-to-register) with the production domain |
| Supabase | Site URL and Redirect URLs → production frontend |
| Frontend build | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` must be set in the build environment (no `backend/.env` there) |

---

## Troubleshooting

Run `npm run check-env` first. It diagnoses most of these.

| Symptom | Cause | Fix |
|---|---|---|
| `callback URL not registered on the GitHub App` | Callback URL on the app doesn't match | Set it to the URL printed by check-env, and tick "Request user authorization during installation" |
| `missing permissions/events needed for push monitoring` | App still has read-only Contents/PRs | [4.2](#42-permissions-permissions--events-tab), then accept on the installation ([4.4](#44-changing-permissions-on-an-existing-app)) |
| `App authentication failed` / `JSON web token could not be decoded` | Private key belongs to another app, or was deleted on GitHub | Generate a new key on this app; keep only one `.pem` in `backend/` |
| Fix PR not opened, note says `403 Resource not accessible by integration` | New permissions not accepted on the installation | [4.4](#44-changing-permissions-on-an-existing-app) |
| Fix PR not opened, note says `could not be applied exactly` | Gemini's edit didn't match the code | Expected safety behaviour. The Slack alert still has the suggested fix |
| Nothing happens on push | Webhook not reaching the API | Is ngrok running? GitHub App → Advanced → Recent Deliveries shows each delivery's response. Is the repository added and monitoring enabled? |
| `push monitoring table is missing` | Migration not run | Run `20261002000004_pipeline_alerts.sql` |
| `database tables are missing` | Schema not installed | Run `supabase/setup_all.sql` |
| `SUPABASE_ANON_KEY rejected` / keys swapped warning | Wrong key in the wrong variable | Re-copy from Supabase → Project Settings → API |
| Slack: `redirect URL is not https` | `PUBLIC_API_URL` not set | [Step 2](#2-public-url-ngrok) |
| Slack: `bad_redirect_uri` during connect | Redirect URL not added to the Slack app | Add the URL printed by check-env under OAuth & Permissions |
| Slack alert not posted to a private channel | App not in the channel | `/invite @YourApp` in that channel |
| Gemini `temporarily unavailable` | Google is overloaded | Automatic retry and fallback. CI failures are still alerted. Try again later |
| Gemini `API key rejected` | Wrong or revoked key | New key from AI Studio |
| `Port 5000 is already in use` | Another API instance is running | Stop it, or change `PORT` (and update ngrok) |
| Slack tokens stopped working after a restart | `APP_ENCRYPTION_KEY` changed | Restore the old value, or reconnect Slack |
