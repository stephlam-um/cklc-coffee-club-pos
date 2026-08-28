const required = [
  ['SUPABASE_URL', 'supabaseUrl'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'supabaseServiceRoleKey'],
  ['SESSION_SECRET', 'sessionSecret'],
]

export function readServerEnv(source = process.env) {
  const values = {}
  for (const [name, key] of required) {
    const value = String(source[name] || '').trim()
    if (!value) throw new Error(`${name} is not configured`)
    values[key] = value
  }

  values.sheetsSyncUrl = String(source.GOOGLE_SHEETS_SYNC_URL || '').trim()
  values.sheetsSyncToken = String(source.GOOGLE_SHEETS_SYNC_TOKEN || '').trim()
  return values
}
