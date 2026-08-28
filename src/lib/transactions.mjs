import { calculateCartTotal, getUnitPrice, normalizeTemperature } from './domain.mjs'

const PENDING_TRANSACTION_PREFIX = 'pos.pending-transaction:v1:'

export function buildTransactionPayload({ id, shiftId, staffId, mode, cart, paymentMethod = '', wasteReason = '' }) {
  const items = cart.map(({ product, temperature, quantity }) => {
    const unitPrice = getUnitPrice(product, mode)
    return {
      productId: product.id,
      name: product.name,
      temperature: normalizeTemperature(temperature),
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity,
    }
  })
  return {
    transactionId: id,
    shiftId,
    staffId,
    type: mode,
    items,
    total: mode === 'WASTE' ? 0 : calculateCartTotal(cart, mode),
    paymentMethod: mode === 'WASTE' ? '' : paymentMethod,
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
    return { product, temperature: normalizeTemperature(item.temperature), quantity: item.quantity }
  })
  if (cart.some(item => !item)) return null
  return { cart, mode: transaction.type, wasteReason: transaction.wasteReason || 'MADE_WRONG' }
}
