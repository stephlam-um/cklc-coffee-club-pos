import { fingerprintTransaction } from './hash.mjs'

const TYPES = new Set(['NORMAL_SALE', 'STAFF', 'STAFF_REWARD', 'WASTE'])
const PAYMENTS = new Set(['MPAY', 'WECHAT_PAY'])
const WASTE_REASONS = new Set(['MADE_WRONG', 'CALIBRATION', 'SPILLED', 'OTHER'])
const TEMPERATURES = new Set(['', 'HOT', 'ICED'])
const CUP_TYPES = new Set(['DINE_IN', 'PERSONAL_CUP'])
const PERSONAL_CUP_CAMPAIGN_ID = 'PERSONAL_CUP_2026'

function macauDate(now) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Macau', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function validateTransactionInput(input, now = new Date()) {
  if (!input || !input.transactionId || !input.shiftId || !input.staffId) throw new Error('Missing transaction identifiers')
  if (!TYPES.has(input.type)) throw new Error('Invalid transaction type')
  const free = input.type === 'WASTE' || input.type === 'STAFF_REWARD'
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error('Transaction needs at least one item')
  const items = input.items.map(item => {
    const quantity = Number(item.quantity)
    const unitPrice = Number(item.unitPrice)
    const rmbUnitPrice = item.rmbUnitPrice == null ? (free ? 0 : unitPrice - 2) : Number(item.rmbUnitPrice)
    const cupType = String(item.cupType || 'DINE_IN')
    const baseUnitPrice = item.baseUnitPrice == null ? unitPrice : Number(item.baseUnitPrice)
    const discountUnitPrice = item.discountUnitPrice == null ? 0 : Number(item.discountUnitPrice)
    const campaignId = String(item.campaignId || '')
    if (!item.productId || !item.name || !Number.isInteger(quantity) || quantity <= 0) throw new Error('Invalid transaction item')
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('Invalid item price')
    if (!Number.isFinite(rmbUnitPrice) || rmbUnitPrice < 0) throw new Error('Invalid RMB item price')
    if (!CUP_TYPES.has(cupType)) throw new Error('Invalid cup type')
    if (!Number.isFinite(baseUnitPrice) || baseUnitPrice < 0 || !Number.isFinite(discountUnitPrice) || discountUnitPrice < 0) throw new Error('Invalid discount')
    if (cupType === 'PERSONAL_CUP') {
      const date = macauDate(now)
      if (input.type !== 'NORMAL_SALE' || campaignId !== PERSONAL_CUP_CAMPAIGN_ID || discountUnitPrice !== 3 || baseUnitPrice - discountUnitPrice !== unitPrice) throw new Error('Invalid personal-cup discount')
      if (date < '2026-09-24' || date > '2026-09-25') throw new Error('Personal-cup campaign is not active')
    } else if (discountUnitPrice !== 0 || campaignId) throw new Error('Invalid discount')
    if (input.type === 'STAFF_REWARD' && (unitPrice !== 0 || rmbUnitPrice !== 0)) throw new Error('Reward items must be free')
    if (!free && Math.round(rmbUnitPrice * 100) !== Math.round((unitPrice - 2) * 100)) throw new Error('RMB price must be MOP price minus 2')
    const temperature = String(item.temperature || '')
    if (!TEMPERATURES.has(temperature)) throw new Error('Invalid temperature')
    return { productId: String(item.productId), name: String(item.name), temperature, cupType, quantity, baseUnitPrice, discountUnitPrice, campaignId, unitPrice, rmbUnitPrice: input.type === 'STAFF_REWARD' ? null : rmbUnitPrice, lineTotal: unitPrice * quantity }
  })
  const total = Number(input.total)
  const paymentMethod = String(input.paymentMethod || '')
  const wasteReason = String(input.wasteReason || '')
  if (!Number.isFinite(total) || total < 0) throw new Error('Invalid total')
  if (input.type === 'WASTE') {
    if (!WASTE_REASONS.has(wasteReason)) throw new Error('Invalid waste reason')
    if (total !== 0 || paymentMethod) throw new Error('Waste must have zero total and no payment method')
  } else if (input.type === 'STAFF_REWARD') {
    if (total !== 0 || paymentMethod || wasteReason) throw new Error('Reward must have zero total, no payment method and no waste reason')
  } else {
    if (!PAYMENTS.has(paymentMethod)) throw new Error('Invalid payment method')
  }
  return { ...input, transactionId: String(input.transactionId), shiftId: String(input.shiftId), staffId: String(input.staffId), items, total, paymentMethod, wasteReason }
}

export { TYPES, PAYMENTS, WASTE_REASONS, fingerprintTransaction }
