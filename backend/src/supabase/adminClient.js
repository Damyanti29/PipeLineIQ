import { createClient } from '@supabase/supabase-js'
import { env, features } from '../config/env.js'

// Service-role client: bypasses RLS. Server-side only — used for ingestion, webhooks,
// workers and integration tokens. Every caller must scope queries to the right user itself.
export const supabaseAdmin = features.supabase
  ? createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

export function requireAdmin() {
  if (!supabaseAdmin) throw new Error('Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  return supabaseAdmin
}

// Unwraps a Supabase response, throwing on error.
export function unwrap({ data, error }) {
  if (error) {
    const err = new Error(error.message)
    err.code = error.code
    err.details = error.details
    throw err
  }
  return data
}
