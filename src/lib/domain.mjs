export const MODES = Object.freeze(['NORMAL_SALE', 'STAFF', 'WASTE'])
export const PAYMENT_METHODS = Object.freeze(['MPAY', 'WECHAT_PAY'])
export const WASTE_REASONS = Object.freeze(['MADE_WRONG', 'CALIBRATION', 'SPILLED', 'OTHER'])

export function getUnitPrice(product, mode) {
  if (mode === 'STAFF') return Number(product.staffPrice)
  if (mode === 'NORMAL_SALE') return Number(product.price)
  return 0
}

export function calculateCartTotal(cart, mode) {
  return cart.reduce((sum, line) => sum + getUnitPrice(line.product, mode) * line.quantity, 0)
}

export function addProduct(cart, product) {
  const existing = cart.find((line) => line.product.id === product.id)
  if (!existing) return [...cart, { product, quantity: 1 }]
  return cart.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
}

export function changeQuantity(cart, productId, delta) {
  return cart
    .map((line) => line.product.id === productId ? { ...line, quantity: line.quantity + delta } : line)
    .filter((line) => line.quantity > 0)
}
