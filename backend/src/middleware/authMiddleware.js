import { supabase, createUserClient } from '../supabase/client.js'
import { supabaseAdmin } from '../supabase/adminClient.js'
import { safeEqual } from '../utils/crypto.js'
import { forbidden, notConfigured, unauthorized } from '../utils/httpError.js'

export const INGEST_KEY_HEADER = 'x-reposentinel-key'

function extractBearerToken(req) {
  const header = req.get('authorization') ?? ''
  const [scheme, token] = header.split(' ')
  return scheme?.toLowerCase() === 'bearer' && token ? token.trim() : null
}

// Verifies the Supabase access token and attaches the user. The user identity always
// comes from the token — never from the request body.
export async function requireAuth(req, res, next) {
  if (!supabase) throw notConfigured('Supabase')

  const token = extractBearerToken(req)
  if (!token) throw unauthorized()

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) throw unauthorized('Invalid or expired session')

  req.user = { id: data.user.id, email: data.user.email }
  // Queries made through req.db run as this user, so Row Level Security applies.
  req.db = createUserClient(token)
  next()
}

// Authenticates SDK error ingestion with the repository's ingest key (part of the DSN).
// Expects the body to have been validated already (repositoryId is a UUID).
export async function requireIngestKey(req, res, next) {
  if (!supabaseAdmin) throw notConfigured('Supabase')

  const key = req.get(INGEST_KEY_HEADER)
  if (!key) throw unauthorized('Missing ingest key')

  const { data: repository, error } = await supabaseAdmin
    .from('repositories')
    .select('id, user_id, full_name, html_url, default_branch, monitoring_enabled, ingest_key')
    .eq('id', req.body.repositoryId)
    .maybeSingle()
  if (error) throw error

  // Same response for "unknown repository" and "wrong key" so ids cannot be probed.
  if (!repository || !safeEqual(repository.ingest_key, key)) throw unauthorized('Invalid ingest key')
  if (!repository.monitoring_enabled) throw forbidden('Monitoring is disabled for this repository')

  const { ingest_key: _omit, ...safeRepository } = repository
  req.repository = safeRepository
  next()
}
