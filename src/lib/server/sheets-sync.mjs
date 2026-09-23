import { readServerEnv } from './env.mjs'

export function buildShiftSyncPayload(shift, financialEntries) {
  return { shift, financialEntries }
}

export function filterCompletedTransactions(transactions = []) {
  return transactions.filter(transaction => transaction?.status === 'COMPLETED' && transaction?.fulfillment_status === 'COMPLETED')
}

export async function syncClosedShift(supabase, shiftId, options = {}) {
  const config = options.config || readServerEnv()
  const fetchImpl = options.fetchImpl || fetch
  const shiftResult = await supabase.from('shifts').select('*').eq('id', shiftId).eq('status', 'CLOSED').single()
  if (shiftResult.error) throw shiftResult.error
  try {
    if (!config.sheetsSyncUrl) throw new Error('GOOGLE_SHEETS_SYNC_URL is not configured')
    const entriesResult = await supabase.rpc('get_financial_entries', {})
    if (entriesResult.error) throw entriesResult.error
    const payload = buildShiftSyncPayload(shiftResult.data, entriesResult.data || [])
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
