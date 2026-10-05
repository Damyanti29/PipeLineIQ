# PipelineIQ — Setup, Integration & Troubleshooting Guide

This document captures the end-to-end setup steps, fixes, and troubleshooting solutions implemented for running the PipelineIQ frontend, backend, and external integrations (GitHub App, Supabase, Redis, Gemini, and Slack).

---

## 1. Running the Services

### Backend API
- **Command:** `npm run dev` (inside `backend/`)
- **URL:** `http://localhost:5000`
- **Health check endpoint:** `http://localhost:5000/api/health`

### Frontend Application
- **Command:** `npm run dev` (inside `frontend/`)
- **URL:** `http://localhost:5173`

---

## 2. Issues Encountered & Solutions Implemented

### Issue A: GitHub App Private Key Parsing (`GITHUB_APP_PRIVATE_KEY`)
* **Problem:** When multi-line RSA `.pem` keys are placed in `backend/.env` without quotes, `dotenv` truncates the key at the first newline, resulting in an empty string (`length: 0`) and causing `githubApp` feature flag to remain `false` (showing *"Not configured"*).
* **Fix implemented:**
  - Enhanced `readPem()` in [`backend/src/config/env.js`](file:///c:/Users/bhumi/pipelineiq/backend/src/config/env.js) to:
    1. Read string values (with `\n` escapes or multiline).
    2. Check if the value is a filepath to an existing `.pem` file.
    3. Automatically auto-detect and read any local `*.pem` file present in the `backend/` directory.

---

### Issue B: `GitHub API error: Bad credentials` (Clock Skew)
* **Problem:** GitHub App authentication uses RS256 JWTs with a maximum validity window of 10 minutes (`exp: now + 9m`). If the local computer clock differs from real UTC / GitHub server time (e.g., set to a previous day), GitHub treats the generated JWT token as expired or invalid and rejects all API calls with `401 Bad credentials`.
* **Fix implemented:**
  - Added automatic clock skew detection and synchronization in [`backend/src/services/githubService.js`](file:///c:/Users/bhumi/pipelineiq/backend/src/services/githubService.js).
  - Skew offset is calculated against GitHub's HTTP response `Date` headers (`https://api.github.com`) and applied to `createGithubAppJwt()`, ensuring reliable JWT generation regardless of local machine clock drift.

---

### Issue C: GitHub App Installation vs OAuth Flow
* **Problem:** If a GitHub App is already installed on a user's account, opening the `/apps/<slug>/installations/new` URL redirects directly to the GitHub installation settings page (`https://github.com/settings/installations/...`) without completing the OAuth callback to link the installation ID in Supabase.
* **Fix implemented:**
  - Updated `getConnectUrl()` in [`backend/src/services/githubService.js`](file:///c:/Users/bhumi/pipelineiq/backend/src/services/githubService.js) to use GitHub's standard OAuth authorization URL:
    ```
    https://github.com/login/oauth/authorize?client_id=<CLIENT_ID>&redirect_uri=<REDIRECT_URI>&state=<STATE>
    ```
  - Allows seamless one-click authorization and callback linking for both new and pre-installed apps.

---

### Issue D: `redirect_uri is not associated with this application`
* **Problem:** GitHub strictly validates that the `redirect_uri` sent during OAuth authorization matches one of the **Callback URLs / Redirect URIs** configured in GitHub App Developer Settings.
* **Resolution:**
  - Configured `GITHUB_REDIRECT_URI=http://localhost:5000/api/github/callback` in `backend/.env`.
  - Added `http://localhost:5000/api/github/callback` under **Identifying and authorizing users &rarr; Redirect URIs** in the GitHub App settings on GitHub.com.

---

### Issue E: `Invalid or expired session` (Supabase Auth Skew)
* **Problem:** `@supabase/gotrue-js` checks JWT issue and expiration timestamps. Extreme system clock drift causes sessions to be flagged as future-issued or prematurely expired.
* **Resolution:**
  - Synchronize the Windows system clock via **Settings &rarr; Time & Language &rarr; Date & Time &rarr; Sync now**.
  - Re-authenticate via the PipelineIQ dashboard **Log out** &rarr; **Sign in** flow to obtain fresh tokens.

---

## 3. Git & Security Practices

- `.gitignore` was updated to explicitly ignore `*.pem` and `*.key` files alongside `.env` and `.env.*` files.
- Secrets and `.pem` private keys are never committed to version control.
