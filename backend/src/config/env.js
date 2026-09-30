import dotenv from 'dotenv'

dotenv.config({ quiet: true })

const read = (name, fallback = '') => (process.env[name] ?? fallback).trim()

// Private keys pasted into .env usually have literal "\n" sequences instead of newlines.
const readPem = (name) => read(name).replace(/\\n/g, '\n')

export const env = {
  nodeEnv: read('NODE_ENV', 'development'),
  port: Number(read('PORT', '5000')),
  frontendUrl: read('FRONTEND_URL', 'http://localhost:5173').replace(/\/$/, ''),

  supabaseUrl: read('SUPABASE_URL'),
  supabaseAnonKey: read('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: read('SUPABASE_SERVICE_ROLE_KEY'),

  githubAppId: read('GITHUB_APP_ID'),
  githubAppPrivateKey: readPem('GITHUB_APP_PRIVATE_KEY'),
  githubClientId: read('GITHUB_CLIENT_ID'),
  githubClientSecret: read('GITHUB_CLIENT_SECRET'),
  githubWebhookSecret: read('GITHUB_WEBHOOK_SECRET'),
  githubRedirectUri: read('GITHUB_REDIRECT_URI'),

  slackClientId: read('SLACK_CLIENT_ID'),
  slackClientSecret: read('SLACK_CLIENT_SECRET'),
  slackSigningSecret: read('SLACK_SIGNING_SECRET'),
  slackRedirectUri: read('SLACK_REDIRECT_URI'),

  geminiApiKey: read('GEMINI_API_KEY'),
  geminiModel: read('GEMINI_MODEL') || 'gemini-2.5-flash',

  redisUrl: read('REDIS_URL', 'redis://localhost:6379'),

  // 32+ character secret used to encrypt stored OAuth tokens and sign OAuth state.
  appEncryptionKey: read('APP_ENCRYPTION_KEY'),
}

env.isProduction = env.nodeEnv === 'production'
env.isTest = env.nodeEnv === 'test'

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

export function assertProductionConfig() {
  if (!env.isProduction) return
  const missing = []
  if (!features.supabase) missing.push('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY')
  if (!env.frontendUrl.startsWith('https://')) missing.push('FRONTEND_URL (must be https in production)')
  if (env.appEncryptionKey.length < 32) missing.push('APP_ENCRYPTION_KEY (min 32 characters)')
  if (missing.length) {
    throw new Error(`Invalid production configuration: ${missing.join(', ')}`)
  }
}
