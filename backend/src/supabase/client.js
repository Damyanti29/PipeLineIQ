import { createClient } from '@supabase/supabase-js'
import { env, features } from '../config/env.js'

const options = { auth: { persistSession: false, autoRefreshToken: false } }

// Anon client: used to verify user access tokens.
export const supabase = features.supabase ? createClient(env.supabaseUrl, env.supabaseAnonKey, options) : null

// Per-request client that acts as the signed-in user, so Row Level Security applies.
export function createUserClient(accessToken) {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    ...options,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}
