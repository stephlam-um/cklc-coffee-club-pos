import { fingerprintTransaction } from './hash.mjs'
import { validateTransactionInput } from './validation.mjs'
import { EIGHTY_PERCENT_CAMPAIGN_ID } from '../domain.mjs'

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

  const discounted = input.items.some(item => item.campaignId === EIGHTY_PERCENT_CAMPAIGN_ID)
  if (discounted && String(actor.role).toUpperCase() !== 'MANAGER') throw Object.assign(new Error('Manager access required'), { code: 'FORBIDDEN' })
  const { data, error } = await supabase.rpc(discounted ? 'create_discounted_transaction' : 'create_transaction', {
    p_transaction: {
      id: input.transactionId, shift_id: input.shiftId, staff_id: input.staffId,
      type: input.type, total: input.total, payment_method: input.paymentMethod,
      waste_reason: input.wasteReason, payload_fingerprint: fingerprint,
    },
    p_items: input.items.map(item => ({
      product_id: item.productId, product_name: item.name, temperature: item.temperature,
      quantity: item.quantity, unit_price: item.unitPrice, rmb_unit_price: item.rmbUnitPrice, line_total: item.lineTotal,
      cup_type: item.cupType, base_unit_price: item.baseUnitPrice, discount_unit_price: item.discountUnitPrice, campaign_id: item.campaignId,
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
