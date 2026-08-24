import { calculateCartTotal, getUnitPrice } from './domain.mjs'

export function buildTransactionPayload({ id, shiftId, staffId, mode, cart, paymentMethod = '', wasteReason = '' }) {
  const items = cart.map(({ product, quantity }) => {
    const unitPrice = getUnitPrice(product, mode)
    return { productId: product.id, name: product.name, quantity, unitPrice, lineTotal: unitPrice * quantity }
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
