import { createClient } from '@supabase/supabase-js'
import { readServerEnv } from './env.mjs'

let client

export function getSupabaseAdmin() {
  if (client) return client
  const env = readServerEnv()
  client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return client
}

export function resetSupabaseAdminForTests() {
  client = undefined
}
