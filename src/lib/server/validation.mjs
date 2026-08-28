import { fingerprintTransaction } from './hash.mjs'

const TYPES = new Set(['NORMAL_SALE', 'STAFF', 'WASTE'])
const PAYMENTS = new Set(['MPAY', 'WECHAT_PAY'])
const WASTE_REASONS = new Set(['MADE_WRONG', 'CALIBRATION', 'SPILLED', 'OTHER'])
const TEMPERATURES = new Set(['', 'HOT', 'ICED'])

export function validateTransactionInput(input) {
  if (!input || !input.transactionId || !input.shiftId || !input.staffId) throw new Error('Missing transaction identifiers')
  if (!TYPES.has(input.type)) throw new Error('Invalid transaction type')
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error('Transaction needs at least one item')
  const items = input.items.map(item => {
    const quantity = Number(item.quantity)
    const unitPrice = Number(item.unitPrice)
    if (!item.productId || !item.name || !Number.isInteger(quantity) || quantity <= 0) throw new Error('Invalid transaction item')
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('Invalid item price')
    const temperature = String(item.temperature || '')
    if (!TEMPERATURES.has(temperature)) throw new Error('Invalid temperature')
    return { productId: String(item.productId), name: String(item.name), temperature, quantity, unitPrice, lineTotal: unitPrice * quantity }
  })
  const total = Number(input.total)
  const paymentMethod = String(input.paymentMethod || '')
  const wasteReason = String(input.wasteReason || '')
  if (!Number.isFinite(total) || total < 0) throw new Error('Invalid total')
  if (input.type === 'WASTE') {
    if (!WASTE_REASONS.has(wasteReason)) throw new Error('Invalid waste reason')
    if (total !== 0 || paymentMethod) throw new Error('Waste must have zero total and no payment method')
  } else {
    if (!PAYMENTS.has(paymentMethod)) throw new Error('Invalid payment method')
  }
  return { ...input, transactionId: String(input.transactionId), shiftId: String(input.shiftId), staffId: String(input.staffId), items, total, paymentMethod, wasteReason }
}

export { TYPES, PAYMENTS, WASTE_REASONS, fingerprintTransaction }
