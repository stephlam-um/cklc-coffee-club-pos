import { createClient } from '@supabase/supabase-js'
import { readServerEnv } from '../src/lib/server/env.mjs'
import { hashPin } from '../src/lib/server/hash.mjs'

const [id, name, pin, role = 'STAFF'] = process.argv.slice(2)
if (!id || !name || !pin || !/^\d{4}$/.test(pin)) {
  throw new Error('Usage: node scripts/create-staff.mjs <id> <name> <4-digit-pin> [role]')
}

const env = readServerEnv()
const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, { auth: { persistSession: false } })
const { error } = await supabase.from('staff').upsert({ id, name, pin_hash: await hashPin(pin), role, active: true })
if (error) throw new Error(error.message)
console.log(`Staff ${id} created.`)
