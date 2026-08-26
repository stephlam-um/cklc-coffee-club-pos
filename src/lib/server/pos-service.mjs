import { fingerprintTransaction } from './hash.mjs'
import { validateTransactionInput } from './validation.mjs'

export function idempotencyResult(existing, fingerprint) {
  if (existing.payload_fingerprint !== fingerprint) {
    const error = new Error('CONFLICTING_TRANSACTION')
    error.code = 'CONFLICTING_TRANSACTION'
    throw error
  }
  return { transactionId: String(existing.id), duplicate: true }
}

export async function createOrGetTransaction(supabase, rawInput, actor) {
  const input = validateTransactionInput(rawInput)
  if (!actor?.id || String(actor.id) !== input.staffId) throw new Error('Unauthorized')
  const fingerprint = fingerprintTransaction(input)
  const { data: existing, error: lookupError } = await supabase
    .from('transactions').select('id,payload_fingerprint').eq('id', input.transactionId).maybeSingle()
  if (lookupError) throw lookupError
  if (existing) return idempotencyResult(existing, fingerprint)

  const { data, error } = await supabase.rpc('create_transaction', {
    p_transaction: {
      id: input.transactionId, shift_id: input.shiftId, staff_id: input.staffId,
      type: input.type, total: input.total, payment_method: input.paymentMethod,
      waste_reason: input.wasteReason, payload_fingerprint: fingerprint,
    },
    p_items: input.items.map(item => ({
      product_id: item.productId, product_name: item.name, temperature: item.temperature,
      quantity: item.quantity, unit_price: item.unitPrice, line_total: item.lineTotal,
    })),
  })
  if (error) {
    if (error.code === '23505') {
      const retry = await supabase.from('transactions').select('id,payload_fingerprint').eq('id', input.transactionId).single()
      if (retry.error) throw retry.error
      return idempotencyResult(retry.data, fingerprint)
    }
    throw error
  }
  return data || { transactionId: input.transactionId, duplicate: false }
}
