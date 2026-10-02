// Live verification of every credential in backend/.env. Read-only: no rows are written and no
// messages are sent. Used by `npm run check-env` and `npm run simulate`.
import fs from 'node:fs'
import path from 'node:path'
import { generateContent } from '../services/aiService.js'
import { githubRequest } from '../services/githubService.js'
import { requireAdmin } from '../supabase/adminClient.js'
import { createGithubAppJwt } from '../utils/crypto.js'
import { checkRedis } from '../workers/queue.js'
import { BACKEND_DIR, env, features, missingVariables } from './env.js'

const missing = (key) => ({ ok: false, detail: `missing ${missingVariables()[key].join(', ')}` })

async function checkSupabase() {
  if (!features.supabase) return missing('supabase')
  const admin = requireAdmin()

  const auth = await fetch(`${env.supabaseUrl}/auth/v1/settings`, { headers: { apikey: env.supabaseAnonKey }, signal: AbortSignal.timeout(10000) })
  if (!auth.ok) return { ok: false, detail: `SUPABASE_ANON_KEY rejected (HTTP ${auth.status})`, fix: 'Copy the anon/publishable key from Supabase → Project Settings → API.' }

  // Not a HEAD request: those report a missing table as an empty 204 instead of an error.
  const { count, error } = await admin.from('errors').select('id', { count: 'exact' }).limit(1)
  if (error) {
    const noTable = /does not exist|schema cache|PGRST205/i.test(`${error.code} ${error.message}`)
    return noTable
      ? { ok: false, detail: 'connected, but the database tables are missing', fix: 'Supabase → SQL Editor → paste and run supabase/setup_all.sql.' }
      : { ok: false, detail: `SUPABASE_SERVICE_ROLE_KEY rejected: ${error.message}`, fix: 'Copy the service_role/secret key from Supabase → Project Settings → API.' }
  }
  const rpc = await admin.rpc('error_trend', { p_days: 1 })
  if (rpc.error) return { ok: false, detail: 'tables exist but database functions are missing', fix: 'Run supabase/migrations/20260930000003_functions.sql (or setup_all.sql) in the SQL Editor.' }
  const alerts = await admin.from('pipeline_alerts').select('id').limit(1)
  if (alerts.error) return { ok: false, detail: 'push monitoring table is missing', fix: 'Supabase → SQL Editor → run supabase/migrations/20261002000004_pipeline_alerts.sql.' }

  return { ok: true, detail: `connected, schema installed (${count} error groups)` }
}

function checkFrontendEnv() {
  const file = path.join(BACKEND_DIR, '..', 'frontend', '.env')
  if (!fs.existsSync(file)) return { ok: true, detail: 'no frontend/.env, so the frontend uses the Supabase values from backend/.env' }
  const values = Object.fromEntries(
    fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.match(/^\s*(VITE_\w+)\s*=\s*"?([^"]*)"?\s*$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
  )
  const mismatched = [
    ['VITE_SUPABASE_URL', env.supabaseUrl],
    ['VITE_SUPABASE_ANON_KEY', env.supabaseAnonKey],
  ].filter(([name, backendValue]) => values[name] && values[name].replace(/\/+$/, '') !== backendValue)
  if (mismatched.length) {
    return {
      ok: false,
      detail: `${mismatched.map(([n]) => n).join(', ')} in frontend/.env differ from backend/.env`,
      fix: 'Delete those lines from frontend/.env (the backend values are used automatically) or make them match.',
    }
  }
  return { ok: true, detail: 'frontend/.env consistent with backend/.env' }
}

async function checkGithub() {
  if (!features.githubApp) return missing('githubApp')
  let app
  let installs
  try {
    const token = createGithubAppJwt(env.githubAppId, env.githubAppPrivateKey)
    app = await githubRequest('/app', { token })
    installs = await githubRequest('/app/installations', { token })
  } catch (err) {
    return { ok: false, detail: `App authentication failed: ${err.message}`, fix: 'GITHUB_APP_ID and the private key must come from the same GitHub App, and the key must not be deleted there.' }
  }

  const probe = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.githubClientId, client_secret: env.githubClientSecret, code: 'check-env', redirect_uri: env.githubRedirectUri }),
    signal: AbortSignal.timeout(10000),
  }).then((r) => r.json()).catch(() => ({}))
  const problems = []
  if (probe.error === 'incorrect_client_credentials') {
    problems.push({ detail: 'GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET rejected', fix: `GitHub App "${app.slug}" → General → Client ID, and generate a new client secret.` })
  }
  if (probe.error === 'redirect_uri_mismatch') {
    problems.push({ detail: 'callback URL not registered on the GitHub App', fix: `GitHub App "${app.slug}" → General → Callback URL = ${env.githubRedirectUri}, and tick "Request user authorization (OAuth) during installation".` })
  }

  // Push monitoring reads CI logs and code, and opens fix PRs.
  const RANK = { read: 1, write: 2 }
  const needed = { contents: 'write', pull_requests: 'write', actions: 'read', issues: 'write', metadata: 'read' }
  const lacking = Object.entries(needed).filter(([perm, level]) => (RANK[app.permissions?.[perm]] ?? 0) < RANK[level])
  const missingEvents = ['push', 'workflow_run', 'pull_request', 'issues'].filter((e) => !app.events?.includes(e))
  if (lacking.length || missingEvents.length) {
    const parts = [
      lacking.length && `Repository permissions → ${lacking.map(([p, l]) => `${p.replace('_', ' ')}: ${l === 'write' ? 'Read and write' : 'Read-only'}`).join(', ')}`,
      missingEvents.length && `Subscribe to events → ${missingEvents.join(', ')}`,
    ].filter(Boolean)
    problems.push({
      detail: 'missing permissions/events needed for push monitoring',
      fix: `GitHub App "${app.slug}" → Permissions & events: ${parts.join('; ')}. Then accept the new permissions on each installation (GitHub emails the owner).`,
    })
  }
  if (problems.length) {
    return { ok: false, detail: problems.map((p) => p.detail).join('; '), fix: problems.map((p) => p.fix).join('\n    → ') }
  }

  const webhook = features.githubWebhooks ? '' : '; GITHUB_WEBHOOK_SECRET not set, so pushes and CI runs are not monitored'
  return { ok: true, detail: `app "${app.slug}" authenticated, OAuth client OK, permissions OK, ${installs.length} installation(s)${webhook}` }
}

async function checkSlack() {
  if (!features.slack) return missing('slack')
  const body = new URLSearchParams({ client_id: env.slackClientId, client_secret: env.slackClientSecret, code: 'check-env', redirect_uri: env.slackRedirectUri })
  const data = await fetch('https://slack.com/api/oauth.v2.access', { method: 'POST', body, signal: AbortSignal.timeout(10000) }).then((r) => r.json())
  if (['invalid_client_id', 'bad_client_secret'].includes(data.error)) {
    return { ok: false, detail: `${data.error === 'invalid_client_id' ? 'SLACK_CLIENT_ID' : 'SLACK_CLIENT_SECRET'} rejected`, fix: 'Slack app → Basic Information → App Credentials.' }
  }
  if (data.error === 'bad_redirect_uri') {
    return { ok: false, detail: 'redirect URL not registered in the Slack app', fix: `Slack app → OAuth & Permissions → Redirect URLs → add ${env.slackRedirectUri}` }
  }
  const notes = [
    !env.slackRedirectUri.startsWith('https://') && 'redirect URL is not https, Slack will refuse it (set PUBLIC_API_URL)',
    !features.slackInteractions && 'SLACK_SIGNING_SECRET not set, alert buttons will not work',
  ].filter(Boolean)
  return { ok: notes.length ? null : true, detail: `client credentials OK${notes.length ? `; ${notes.join('; ')}` : ''}` }
}

async function checkGemini() {
  if (!features.gemini) return missing('gemini')
  const result = await generateContent('Reply with the single word OK.', { json: false, timeoutMs: 20000 }).catch((err) => ({ ok: false, status: err.message }))
  if (result.ok) return { ok: true, detail: `responding (model ${result.model})` }
  if ([400, 401, 403].includes(result.status)) return { ok: false, detail: `API key rejected (HTTP ${result.status})`, fix: 'Create a key at https://aistudio.google.com/app/apikey' }
  return { ok: null, detail: `temporarily unavailable (${result.status}); errors are still grouped and alerted` }
}

async function checkRedisService() {
  return (await checkRedis()) === 'up'
    ? { ok: true, detail: 'up' }
    : { ok: null, detail: 'not running; jobs run inside the API process instead (fine for development)' }
}

const safe = (fn) => fn().catch((err) => ({ ok: false, detail: err.message }))

// ok: true = working, false = broken (fix needed), null = works with a limitation.
export async function runChecks() {
  const [supabase, github, slack, gemini, redis] = await Promise.all([
    safe(checkSupabase), safe(checkGithub), safe(checkSlack), safe(checkGemini), safe(checkRedisService),
  ])
  return { supabase, frontend: checkFrontendEnv(), github, slack, gemini, redis }
}
