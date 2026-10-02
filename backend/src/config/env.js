import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

// backend/.env is found from this file, so scripts work from any working directory.
export const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ENV_FILE = path.join(BACKEND_DIR, '.env')
dotenv.config({ path: ENV_FILE, quiet: true })

const read = (name, fallback = '') => (process.env[name] ?? fallback).trim()
const readFlag = (name, fallback) => {
  const value = read(name).toLowerCase()
  return value ? ['1', 'true', 'yes', 'on'].includes(value) : fallback
}
const stripSlash = (url) => url.replace(/\/+$/, '')

// Problems found while reading the configuration. Printed at startup and by `npm run check-env`.
export const configIssues = []
const issue = (level, variable, message) => configIssues.push({ level, variable, message })

const nodeEnv = read('NODE_ENV', 'development')
const isTest = nodeEnv === 'test'
const isProduction = nodeEnv === 'production'
const port = Number(read('PORT', '5000'))

// Public base URL of this API. OAuth redirect URIs are derived from it unless set explicitly.
// Locally this is http://localhost:5000; behind a tunnel or in production use the https URL.
const publicApiUrl = stripSlash(read('PUBLIC_API_URL') || `http://localhost:${port}`)

// ─── GitHub App private key ─────────────────────────────────────
// Accepted forms, in priority order:
//   GITHUB_APP_PRIVATE_KEY_PATH=github-app.pem          (path relative to backend/)
//   GITHUB_APP_PRIVATE_KEY="-----BEGIN ...\n..."         (PEM, real newlines or \n escapes)
//   GITHUB_APP_PRIVATE_KEY=<base64 of the .pem file>
//   nothing set: the single *.pem file in backend/ is used (development only)
function readFileFromBackend(file) {
  const full = path.isAbsolute(file) ? file : path.join(BACKEND_DIR, file)
  return fs.readFileSync(full, 'utf8')
}

function findPemInBackend() {
  const pems = fs
    .readdirSync(BACKEND_DIR)
    .filter((name) => name.toLowerCase().endsWith('.pem'))
    .map((name) => ({ name, mtime: fs.statSync(path.join(BACKEND_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  if (pems.length > 1) {
    issue('warn', 'GITHUB_APP_PRIVATE_KEY', `${pems.length} .pem files in backend/, using the newest (${pems[0].name}). Delete the others.`)
  }
  return pems[0]?.name
}

function resolvePrivateKey() {
  let source = ''
  let pem = ''
  try {
    const keyPath = read('GITHUB_APP_PRIVATE_KEY_PATH')
    const raw = read('GITHUB_APP_PRIVATE_KEY')
    if (keyPath) {
      source = `GITHUB_APP_PRIVATE_KEY_PATH (${keyPath})`
      pem = readFileFromBackend(keyPath)
    } else if (raw.includes('-----BEGIN')) {
      source = 'GITHUB_APP_PRIVATE_KEY'
      pem = raw.replace(/\\n/g, '\n')
    } else if (/\.pem$/i.test(raw)) {
      source = `GITHUB_APP_PRIVATE_KEY (file ${raw})`
      pem = readFileFromBackend(raw)
    } else if (raw) {
      source = 'GITHUB_APP_PRIVATE_KEY (base64)'
      pem = Buffer.from(raw, 'base64').toString('utf8')
    } else if (!isTest && !isProduction) {
      const found = findPemInBackend()
      if (!found) return ''
      source = `backend/${found} (auto-detected)`
      pem = readFileFromBackend(found)
    }
  } catch (err) {
    issue('error', 'GITHUB_APP_PRIVATE_KEY', `Could not read the private key from ${source}: ${err.message}`)
    return ''
  }
  if (!pem) return ''

  try {
    crypto.createPrivateKey(pem.trim())
  } catch {
    issue('error', 'GITHUB_APP_PRIVATE_KEY', `${source} is not a valid private key. Paste the whole .pem file, including the BEGIN/END lines.`)
    return ''
  }
  return pem.trim()
}

// ─── Encryption key ─────────────────────────────────────────────
// In development a missing key is generated once and saved to backend/.env, because changing
// it later makes stored Slack tokens unreadable.
function resolveEncryptionKey() {
  const key = read('APP_ENCRYPTION_KEY')
  if (key || isTest || isProduction) return key

  const generated = crypto.randomBytes(32).toString('hex')
  try {
    const line = `APP_ENCRYPTION_KEY="${generated}"`
    const current = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : ''
    const next = /^APP_ENCRYPTION_KEY=.*$/m.test(current)
      ? current.replace(/^APP_ENCRYPTION_KEY=.*$/m, line)
      : `${current.replace(/\s*$/, '')}\n\n# Generated automatically on first start. Keep it: changing it invalidates stored Slack tokens.\n${line}\n`
    fs.writeFileSync(ENV_FILE, next)
    issue('info', 'APP_ENCRYPTION_KEY', 'Was empty, so a new key was generated and saved to backend/.env.')
  } catch (err) {
    issue('warn', 'APP_ENCRYPTION_KEY', `Generated a temporary key but could not save it to .env (${err.message}).`)
  }
  return generated
}

export const env = {
  nodeEnv,
  port,
  publicApiUrl,
  frontendUrl: stripSlash(read('FRONTEND_URL', 'http://localhost:5173')),

  supabaseUrl: stripSlash(read('SUPABASE_URL')),
  supabaseAnonKey: read('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: read('SUPABASE_SERVICE_ROLE_KEY'),

  githubAppId: read('GITHUB_APP_ID'),
  githubAppPrivateKey: resolvePrivateKey(),
  githubClientId: read('GITHUB_CLIENT_ID'),
  githubClientSecret: read('GITHUB_CLIENT_SECRET'),
  githubWebhookSecret: read('GITHUB_WEBHOOK_SECRET'),
  githubRedirectUri: read('GITHUB_REDIRECT_URI') || `${publicApiUrl}/api/github/callback`,

  slackClientId: read('SLACK_CLIENT_ID'),
  slackClientSecret: read('SLACK_CLIENT_SECRET'),
  slackSigningSecret: read('SLACK_SIGNING_SECRET'),
  slackRedirectUri: read('SLACK_REDIRECT_URI') || `${publicApiUrl}/api/slack/callback`,

  geminiApiKey: read('GEMINI_API_KEY'),
  geminiModel: read('GEMINI_MODEL') || 'gemini-3.5-flash',

  redisUrl: read('REDIS_URL', 'redis://localhost:6379'),

  // Push monitoring: Gemini reviews each push's diff, and fixes for detected bugs are opened as PRs.
  pushReview: readFlag('PUSH_REVIEW', true),
  autoFixPr: readFlag('AUTO_FIX_PR', true),

  // 32+ character secret used to encrypt stored OAuth tokens and sign OAuth state.
  appEncryptionKey: resolveEncryptionKey(),
}

env.isProduction = isProduction
env.isTest = isTest

// ─── Sanity checks on values that are set ───────────────────────
function supabaseKeyRole(key) {
  if (key.startsWith('sb_publishable_')) return 'anon'
  if (key.startsWith('sb_secret_')) return 'service_role'
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role ?? null
  } catch {
    return null
  }
}

if (!isTest) {
  if (env.supabaseUrl && !/^https?:\/\/[^/]+$/.test(env.supabaseUrl)) {
    issue('error', 'SUPABASE_URL', 'Should look like https://<project>.supabase.co (the Project URL, nothing after it).')
  }
  if (env.supabaseAnonKey && supabaseKeyRole(env.supabaseAnonKey) === 'service_role') {
    issue('error', 'SUPABASE_ANON_KEY', 'This is the service_role/secret key. Use the anon/publishable key here.')
  }
  if (env.supabaseServiceRoleKey && supabaseKeyRole(env.supabaseServiceRoleKey) === 'anon') {
    issue('error', 'SUPABASE_SERVICE_ROLE_KEY', 'This is the anon/publishable key. Use the service_role/secret key here.')
  }
  if (env.githubAppId && !/^\d+$/.test(env.githubAppId)) {
    issue('error', 'GITHUB_APP_ID', 'Should be the numeric App ID, not the Client ID.')
  }
  if (env.githubClientId && /^\d+$/.test(env.githubClientId)) {
    issue('error', 'GITHUB_CLIENT_ID', 'Looks like the numeric App ID. The Client ID starts with "Iv".')
  }
  if (env.appEncryptionKey && env.appEncryptionKey.length < 32) {
    issue('error', 'APP_ENCRYPTION_KEY', 'Must be at least 32 characters.')
  }
  if (env.slackClientId && !env.slackRedirectUri.startsWith('https://')) {
    issue('warn', 'SLACK_REDIRECT_URI', `Slack only accepts https redirect URLs. Set PUBLIC_API_URL to your tunnel URL (currently ${env.slackRedirectUri}).`)
  }
}

const allSet = (...values) => values.every(Boolean)

// Feature flags: integrations are optional so the API boots without credentials.
export const features = {
  supabase: allSet(env.supabaseUrl, env.supabaseAnonKey, env.supabaseServiceRoleKey),
  githubApp: allSet(env.githubAppId, env.githubAppPrivateKey, env.githubClientId, env.githubClientSecret, env.githubRedirectUri, env.appEncryptionKey),
  githubWebhooks: Boolean(env.githubWebhookSecret),
  slack: allSet(env.slackClientId, env.slackClientSecret, env.slackRedirectUri, env.appEncryptionKey),
  slackInteractions: Boolean(env.slackSigningSecret),
  gemini: Boolean(env.geminiApiKey),
}
// CI failure analysis needs the GitHub App (logs, code), webhooks (events) and Gemini.
features.pushMonitoring = features.githubApp && features.githubWebhooks && features.gemini && features.supabase

// What each integration still needs, for the startup summary and check-env.
export function missingVariables() {
  const missing = (pairs) => pairs.filter(([, value]) => !value).map(([name]) => name)
  return {
    supabase: missing([['SUPABASE_URL', env.supabaseUrl], ['SUPABASE_ANON_KEY', env.supabaseAnonKey], ['SUPABASE_SERVICE_ROLE_KEY', env.supabaseServiceRoleKey]]),
    githubApp: missing([['GITHUB_APP_ID', env.githubAppId], ['GITHUB_APP_PRIVATE_KEY', env.githubAppPrivateKey], ['GITHUB_CLIENT_ID', env.githubClientId], ['GITHUB_CLIENT_SECRET', env.githubClientSecret]]),
    githubWebhooks: missing([['GITHUB_WEBHOOK_SECRET', env.githubWebhookSecret]]),
    slack: missing([['SLACK_CLIENT_ID', env.slackClientId], ['SLACK_CLIENT_SECRET', env.slackClientSecret]]),
    slackInteractions: missing([['SLACK_SIGNING_SECRET', env.slackSigningSecret]]),
    gemini: missing([['GEMINI_API_KEY', env.geminiApiKey]]),
  }
}

export function assertProductionConfig() {
  if (!env.isProduction) return
  const missing = []
  if (!features.supabase) missing.push('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY')
  if (!env.frontendUrl.startsWith('https://')) missing.push('FRONTEND_URL (must be https in production)')
  if (env.appEncryptionKey.length < 32) missing.push('APP_ENCRYPTION_KEY (min 32 characters)')
  for (const { level, variable, message } of configIssues) if (level === 'error') missing.push(`${variable} (${message})`)
  if (missing.length) {
    throw new Error(`Invalid production configuration: ${missing.join(', ')}`)
  }
}
