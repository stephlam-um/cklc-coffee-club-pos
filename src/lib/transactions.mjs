import { calculateCartTotal, getEightyPercentPrices, getRmbUnitPrice, getUnitPrice, normalizeCupType, normalizeTemperature, isPersonalCupCampaignActive, isRewardEligible, EIGHTY_PERCENT_CAMPAIGN_ID, PERSONAL_CUP_CAMPAIGN_ID, PERSONAL_CUP_DISCOUNT } from './domain.mjs'

const PENDING_TRANSACTION_PREFIX = 'pos.pending-transaction:v1:'

export function buildTransactionPayload({ id, shiftId, staffId, mode, cart, paymentMethod = '', wasteReason = '', now = new Date(), discount = false }) {
  if (discount && (mode !== 'NORMAL_SALE' || cart.some(line => normalizeCupType(line.cupType) === 'PERSONAL_CUP'))) throw new Error('8折 applies to regular sales without another discount')
  const free = mode === 'WASTE' || mode === 'STAFF_REWARD'
  if (mode === 'STAFF_REWARD' && cart.some(line => !isRewardEligible(line.product))) throw new Error('XXL drinks cannot be redeemed')
  const items = cart.map(({ product, temperature, cupType: rawCupType, quantity }) => {
    const cupType = normalizeCupType(rawCupType)
    const personalCup = mode === 'NORMAL_SALE' && cupType === 'PERSONAL_CUP' && isPersonalCupCampaignActive(now)
    const discounted = discount ? getEightyPercentPrices(product.price) : null
    const unitPrice = discounted?.unitPrice ?? getUnitPrice(product, mode, cupType, now)
    return {
      productId: product.id,
      name: product.name,
      temperature: normalizeTemperature(temperature),
      quantity,
      ...(personalCup ? { cupType, baseUnitPrice: Number(product.price), discountUnitPrice: PERSONAL_CUP_DISCOUNT, campaignId: PERSONAL_CUP_CAMPAIGN_ID } : {}),
      ...(discounted ? { baseUnitPrice: Number(product.price), discountUnitPrice: discounted.discountUnitPrice, campaignId: EIGHTY_PERCENT_CAMPAIGN_ID } : {}),
      unitPrice,
      rmbUnitPrice: free ? null : discounted?.rmbUnitPrice ?? getRmbUnitPrice(unitPrice),
      lineTotal: discounted ? Math.round(unitPrice * 100) * quantity / 100 : unitPrice * quantity,
    }
  })
  return {
    transactionId: id,
    shiftId,
    staffId,
    type: mode,
    items,
    total: mode === 'WASTE' ? 0 : calculateCartTotal(cart, mode, now, discount),
    paymentMethod: free ? '' : paymentMethod,
    wasteReason: mode === 'WASTE' ? wasteReason : '',
  }
}

export function createId(prefix = 'tx') {
  return `${prefix}-${Date.now()}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`
}

export function createCheckoutDraft(args) {
  const id = createId('tx')
  return {
    id,
    transaction: buildTransactionPayload({ ...args, id }),
    retry: () => buildTransactionPayload({ ...args, id }),
  }
}

function pendingTransactionKey({ staffId, shiftId }) {
  return `${PENDING_TRANSACTION_PREFIX}${encodeURIComponent(String(staffId))}:${encodeURIComponent(String(shiftId))}`
}

export function savePendingTransaction(storage, transaction) {
  if (!storage || !transaction?.staffId || !transaction?.shiftId || !transaction?.transactionId) return false
  try {
    storage.setItem(pendingTransactionKey(transaction), JSON.stringify(transaction))
    return true
  } catch {
    return false
  }
}

export function loadPendingTransaction(storage, scope) {
  if (!storage || !scope?.staffId || !scope?.shiftId) return null
  try {
    const raw = storage.getItem(pendingTransactionKey(scope))
    if (!raw) return null
    const transaction = JSON.parse(raw)
    if (!transaction?.transactionId || String(transaction.staffId) !== String(scope.staffId) || String(transaction.shiftId) !== String(scope.shiftId) || !Array.isArray(transaction.items) || transaction.items.length === 0) return null
    return transaction
  } catch {
    return null
  }
}

export function clearPendingTransaction(storage, transaction) {
  if (!storage || !transaction?.staffId || !transaction?.shiftId) return false
  try {
    storage.removeItem(pendingTransactionKey(transaction))
    return true
  } catch {
    return false
  }
}

export function restoreCheckoutDraft(products, transaction) {
  if (!Array.isArray(products) || !transaction?.transactionId || !Array.isArray(transaction.items) || transaction.items.length === 0) return null
  const cart = transaction.items.map(item => {
    const product = products.find(candidate => String(candidate.id) === String(item.productId))
    if (!product || !Number.isInteger(item.quantity) || item.quantity <= 0) return null
    return { product, temperature: normalizeTemperature(item.temperature), ...(item.cupType ? { cupType: normalizeCupType(item.cupType) } : {}), quantity: item.quantity }
  })
  if (cart.some(item => !item)) return null
  return { cart, mode: transaction.type, wasteReason: transaction.wasteReason || 'MADE_WRONG' }
}
