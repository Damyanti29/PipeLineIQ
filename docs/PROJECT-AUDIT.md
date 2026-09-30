# Project audit

Baseline audited: commit `77573af` ("testing ui"). The audit was done before any change was made.

## 1. Existing architecture (before)

The repository was branded **PipelineIQ** and contained a **frontend only**:

```
.gitignore  .gitattributes  README.md
frontend/   React 19 + Vite 8 + Tailwind v4 (JavaScript/JSX)
  src/pages/        11 pages (Landing, Login, Dashboard, Repositories, Repository detail,
                    Errors, Error detail, Incidents, Integrations, Settings, 404)
  src/components/   layout/ (DashboardLayout, Sidebar, Topbar), ui/ (9 cards/badges)
  src/context/      AuthContext (mock), ThemeContext
  src/data/         mockData.js: every page rendered hardcoded mock data
  src/lib/utils.js  cn() + date formatting
```

There was no backend, SDK, database schema, API client, environment template or docs, although the README described `backend/` (FastAPI), `sdk/` and `docs/` folders.

## 2. Problems found

### Structure and consistency
| # | Problem |
|---|---|
| 1 | The README documented a Python/FastAPI backend and folders that did not exist. This conflicts with the decision to use JavaScript everywhere |
| 2 | Naming was inconsistent: the brief's target tree was called `reposentinel/` while the app was PipelineIQ. Resolved by keeping **PipelineIQ** everywhere |
| 3 | No services or API layer. Every page imported `src/data/mockData.js` directly |
| 4 | `AuthContext` was a mock: **any credentials logged in** and a fake user was stored in `localStorage`. No Supabase |
| 5 | Data shapes were ad-hoc camelCase mock fields (`repositoryName`, `aiDiagnosis`, `health`, `errorCount`…) that no API could have matched |
| 6 | Duplicate code: the logo markup was repeated in 4 places, the chart tooltip in 2 pages, the pill-filter markup in 3 pages, and `CodeBlock` was local to one page |
| 7 | `DashboardLayout` lived in `components/layout/` (the target has a `layouts/` folder). `Topbar` vs the spec's "Navbar" naming |

### Bugs
| # | Problem |
|---|---|
| 8 | `DashboardPage` referenced a `Slack` icon that was never imported, so it would crash (ReferenceError) whenever Slack was disconnected |
| 9 | Collapsing the sidebar did not move the content (fixed `ml-60`), leaving a 176px gap. There was no mobile layout: the sidebar always covered the page |
| 10 | **CSS layering bug:** component classes (`.input`, `.btn-*`, `.card`, `.badge*`) were unlayered, so they overrode Tailwind v4's layered utilities. `pl-9`, `text-xs`, `py-1.5`, `w-auto`… were silently ignored app-wide (e.g. search placeholders overlapped their icons) |
| 11 | `ErrorDetailPage` / `RepositoryDetailPage` fell back to the first mock item for unknown ids, showing wrong data instead of "not found" |
| 12 | `IncidentCard` and the incidents list linked to `/errors/:errorId`, and "Create GitHub Issue" / Slack "Test" / "Disconnect" only faked success with `alert()` or timers |
| 13 | `npm run lint` crashed: the oxlint native binding was missing (npm optional-dependency bug). `@rolldown/binding-win32-x64-msvc` had been added as a hard dependency to work around the same bug, which would break installs on macOS and Linux |

### Unused or misleading code
| # | Problem |
|---|---|
| 14 | Unused files: `App.css`, `assets/hero.png`, `assets/react.svg`, `assets/vite.svg`, `public/icons.svg` (Vite template leftovers) and the template `frontend/README.md` |
| 15 | `tailwind.config.js` was dead: Tailwind v4 is configured in CSS (`@theme` in `index.css`), which already duplicated its values |
| 16 | Unused dependencies: 6 × `@radix-ui/*`, `class-variance-authority`, `autoprefixer` (built into Tailwind v4), `@types/react*` (TypeScript types in a JS project). `axios` was installed but unused |
| 17 | The landing page had **fabricated testimonials** (quotes attributed to a "Senior Engineer @ Stripe" and a "CTO @ Finflow"), invented pricing ("Free plan includes 3 repositories…"), a footer claiming FastAPI, and dead `href="#"` links |
| 18 | Hardcoded fake UI state: sidebar badges (7, 12), a notification dot, a "pro" plan badge, and a non-functional ⌘K search |
| 19 | Settings toggles (notifications, source maps…) and "Delete account" did nothing and were not backed by anything |

### Security and configuration
| # | Problem |
|---|---|
| 20 | No `.env.example` anywhere. The root `.gitignore` had Python entries and did not ignore `.env.development` / `.env.*` variants |

## 3. Changes made

### Frontend (kept and refactored, not rewritten)
- **Kept:** all 11 pages, the visual design, the Tailwind theme, `ThemeContext`, `StatCard`, `SeverityBadge`, `EmptyState`, `ThemeToggle`, and the card components. All were refactored to real data.
- **Auth:** `AuthContext` now uses Supabase Auth: email sign-in and sign-up with email confirmation, GitHub OAuth, password reset, session persistence, profile and password updates. `DashboardLayout` guards routes and waits for the session to load.
- **API layer:** `lib/api.js` (Axios with the Supabase Bearer token and normalized errors), `services/*` (one module per backend resource) and `hooks/useApi.js` for loading, error and reload state.
- Every page now reads from the API. Loading, empty and error states were added everywhere. Actions really call the backend: resolve, ignore and reopen; incident status; create GitHub issue; pause monitoring; add a repository from GitHub; connect and disconnect Slack; send a Slack test; connect GitHub.
- **Pages:** the repository detail page shows the SDK DSN and snippet plus a GitHub activity feed. The errors page has server-side filters stored in the URL. Integrations shows the OAuth callback results.
- **Structure:** `layouts/DashboardLayout.jsx`, `Topbar` renamed to `Navbar` (with a working search that goes to `/errors?search=`), and `hooks/useAuth.js` + `hooks/useTheme.js` + `context/contexts.js` so that provider files only export components (keeps Fast Refresh working). `utils/format.js` and `utils/repositoryHealth.js` were added.
- **Shared components extracted:** `Logo`, `FilterPills`, `CodeBlock`, `ErrorTrendChart`, `LoadingState`/`Spinner`, `ErrorState`.
- **Fixed:** bugs 8–13 and the CSS layering (component classes moved into `@layer components`). The sidebar collapse now resizes the content, and there is an off-canvas drawer on mobile.
- **Route-level code splitting:** the main bundle went from 708 KB to 250 KB, and the chart library only loads on pages that use it.
- **Branding:** the product briefly used the working name "RepoSentinel" during the refactor and was renamed back to **PipelineIQ** at the owner's request (UI, SDK package `@pipelineiq/sdk`, ingest header `X-PipelineIQ-Key`, docs). New shield favicon. Fabricated testimonials, pricing and dead links were removed and replaced with a real SDK section.
- **Dependencies** cleaned up, `@supabase/supabase-js` added, and a clean reinstall so native bindings resolve as optional dependencies. `npm run lint` now passes with 0 warnings.

### Backend (new): Node.js + Express 5 + Supabase + BullMQ
Routes → controllers → services, following the target structure. Supabase JWT auth, a per-request RLS-scoped database client, SDK ingest-key auth, HMAC-verified GitHub and Slack requests, atomic Postgres error grouping, Gemini analysis with redaction and validation, incidents, Slack Block Kit alerts with threaded updates, idempotent GitHub issue creation, and a queue worker with an in-process fallback. See `docs/ARCHITECTURE.md`.

### Database (new)
Three Supabase migrations: schema, RLS with column-level privileges, and SQL functions. They were applied to a local PostgreSQL 17 instance with a Supabase auth/role shim and tested there: grouping, regression detection, the one-active-incident constraint, cross-user isolation, column privileges and a 40-way concurrency race.

### SDK (new)
`sdk/javascript` (`@pipelineiq/sdk`): `init`, `captureException`, `captureMessage`, `flush`, `close`, global handlers for browser and Node, DSN-based endpoint (nothing hardcoded), `beforeSend`, sampling. Verified against a local HTTP server: its payloads pass the backend's own validation schema.

## 4. Recommended architecture

Implemented as described in `docs/ARCHITECTURE.md`:

```
frontend/  React + Vite (JS)   →  talks only to the API (plus Supabase Auth for sessions)
backend/   Express API          →  Supabase (RLS-scoped per user; service role only where needed)
           BullMQ worker        →  Gemini / Slack / GitHub, off the request path
sdk/       @pipelineiq/sdk    →  POST /api/errors with a per-repository ingest key
supabase/  migrations           →  single source of truth for the schema
```

## 5. Files removed
- `frontend/README.md` (Vite template boilerplate. Setup is documented in the root README)
- `frontend/tailwind.config.js` (dead under Tailwind v4, duplicated `@theme`)
- `frontend/src/App.css`, `frontend/src/assets/hero.png`, `frontend/src/assets/react.svg`, `frontend/src/assets/vite.svg`, `frontend/public/icons.svg` (unused template assets)
- `frontend/src/data/mockData.js` (replaced by the API. Removed after confirming no imports remained)

## 6. Files moved or renamed
- `frontend/src/components/layout/DashboardLayout.jsx` → `frontend/src/layouts/DashboardLayout.jsx`
- `frontend/src/components/layout/Topbar.jsx` → `frontend/src/components/layout/Navbar.jsx`
- Date and number helpers: `frontend/src/lib/utils.js` → `frontend/src/utils/format.js` (`lib/utils.js` keeps `cn()`)
- `useAuth` / `useTheme`: `context/*.jsx` → `hooks/useAuth.js`, `hooks/useTheme.js`

## 7. Files created

**Backend:** `backend/package.json`, `.env.example`, `README.md`; `src/app.js`, `src/server.js`; `src/config/env.js`; `src/controllers/{error,github,incident,repository,slack}Controller.js`; `src/routes/{error,github,health,incident,repository,slack,webhook}Routes.js`, `src/routes/params.js`; `src/services/{ai,error,fingerprint,github,incident,repository,slack,webhook}Service.js`; `src/middleware/{auth,error,webhook}Middleware.js`, `src/middleware/validate.js`; `src/workers/{queue,errorWorker}.js`; `src/supabase/{client,adminClient}.js`; `src/utils/{logger,crypto,redact,httpError}.js`; `tests/` (9 suites + 3 helpers).

**Frontend:** `.env.example`; `src/lib/{api,supabase}.js`; `src/services/{error,github,incident,repository,slack}Service.js`; `src/hooks/{useApi,useAuth,useTheme}.js`; `src/context/contexts.js`; `src/layouts/DashboardLayout.jsx`; `src/components/layout/Navbar.jsx`; `src/components/ui/{CodeBlock,ErrorState,ErrorTrendChart,FilterPills,LoadingState,Logo}.jsx`; `src/utils/{format,repositoryHealth}.js`.

**SDK:** `sdk/javascript/{package.json,README.md}`, `src/{index,capture,transport}.js`.

**Database:** `supabase/migrations/20260930000001_initial_schema.sql`, `…0002_row_level_security.sql`, `…0003_functions.sql`.

**Docs:** `docs/PROJECT-AUDIT.md`, `docs/ARCHITECTURE.md`, `docs/API.md`.

**Tooling:** `.claude/launch.json` (dev-server definitions for the Claude preview pane. Optional, safe to delete).

## 8. Deviations from the brief (and why)

| Brief | Decision |
|---|---|
| `repositories` columns | Added `installation_id`, which is needed to act on the repo as the GitHub App, and `ingest_key`, the SDK credential inside the DSN. The brief asked for ingestion to be designed so key auth could be added. It was cheap to implement now, and leaving ingestion open would let anyone write errors into any repository |
| `incidents` columns | Added `slack_channel_id` (threaded updates), `github_issue_url`, `github_issue_lock_at` (duplicate-issue lock) and `updated_at` |
| Extra table | `github_events` stores verified webhook events so the repository page can show pushes, PRs, workflow runs and deployments. `(repository_id, delivery_id)` is unique so GitHub redeliveries are idempotent |
| Extra env var | `APP_ENCRYPTION_KEY`: encrypts stored Slack tokens and signs OAuth `state` |
| Extra endpoints | `GET /api/github/status`, `GET /api/errors/stats`, `GET/PATCH /api/errors/:id…`, `POST /api/repositories`, `PATCH /api/repositories/:id`, `GET /api/repositories/:id/events`, `POST /api/slack/test`, `POST /api/slack/interactions`. The dashboard and the Slack buttons need them |
| CORS "never `*`" | Holds for the dashboard API (only `FRONTEND_URL`). `POST /api/errors` reflects the caller's origin because SDKs run on customer domains. It uses no cookies and requires the ingest key |
| Error grouping "search then insert/update" | Done atomically in one Postgres function (`ingest_error`), because a JavaScript select-then-insert races under concurrent identical errors |
| Settings page | Kept profile, password, appearance and sign-out, which are backed by Supabase. Removed notification and monitoring toggles and "Delete account", which had nothing behind them |
