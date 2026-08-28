import { calculateCartTotal, getUnitPrice, normalizeTemperature } from './domain.mjs'

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
