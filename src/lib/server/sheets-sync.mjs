import { readServerEnv } from './env.mjs'

export function buildShiftSyncPayload(shift, transactions) {
  return { shift, transactions }
}

export async function syncClosedShift(supabase, shiftId, options = {}) {
  const config = options.config || readServerEnv()
  const fetchImpl = options.fetchImpl || fetch
  const shiftResult = await supabase.from('shifts').select('*').eq('id', shiftId).eq('status', 'CLOSED').single()
  if (shiftResult.error) throw shiftResult.error
  const transactionsResult = await supabase.from('transactions').select('id,shift_id,staff_id,type,total,payment_method,waste_reason,fulfillment_status,created_at,transaction_items(*)').eq('shift_id', shiftId).order('created_at', { ascending: true })
  if (transactionsResult.error) throw transactionsResult.error
  const payload = buildShiftSyncPayload(shiftResult.data, transactionsResult.data || [])

  if (!config.sheetsSyncUrl) return recordSyncResult(supabase, shiftId, 'FAILED', 'GOOGLE_SHEETS_SYNC_URL is not configured')
  try {
    const response = await fetchImpl(config.sheetsSyncUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.sheetsSyncToken}` }, body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(`Sheets sync returned HTTP ${response.status}`)
    return recordSyncResult(supabase, shiftId, 'SYNCED', '')
  } catch (error) {
    return recordSyncResult(supabase, shiftId, 'FAILED', error.message)
  }
}

async function recordSyncResult(supabase, shiftId, status, message) {
  const patch = { sheet_sync_status: status, sheet_synced_at: status === 'SYNCED' ? new Date().toISOString() : null, sheet_sync_error: message }
  const update = await supabase.from('shifts').update(patch).eq('id', shiftId)
  if (update.error) throw update.error
  const attempt = await supabase.from('shift_sync_attempts').insert({ shift_id: shiftId, status, response_message: message })
  if (attempt.error) throw attempt.error
  return { status, error: message || undefined }
}
