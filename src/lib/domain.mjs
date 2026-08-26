export const MODES = Object.freeze(['NORMAL_SALE', 'STAFF', 'WASTE'])
export const PAYMENT_METHODS = Object.freeze(['MPAY', 'WECHAT_PAY'])
export const WASTE_REASONS = Object.freeze(['MADE_WRONG', 'CALIBRATION', 'SPILLED', 'OTHER'])
export const DRINK_TEMPERATURES = Object.freeze(['HOT', 'ICED'])

export function normalizeTemperature(temperature) {
  const value = String(temperature || '').toUpperCase()
  return DRINK_TEMPERATURES.includes(value) ? value : 'ICED'
}

export function getUnitPrice(product, mode) {
  if (mode === 'STAFF') return Number(product.staffPrice)
  if (mode === 'NORMAL_SALE') return Number(product.price)
  return 0
}

export function calculateCartTotal(cart, mode) {
  return cart.reduce((sum, line) => sum + getUnitPrice(line.product, mode) * line.quantity, 0)
}

export function addProduct(cart, product, temperature = 'ICED') {
  const normalizedTemperature = normalizeTemperature(temperature)
  const existing = cart.find((line) => line.product.id === product.id && normalizeTemperature(line.temperature) === normalizedTemperature)
  if (!existing) return [...cart, { product, temperature: normalizedTemperature, quantity: 1 }]
  return cart.map((line) => line.product.id === product.id && normalizeTemperature(line.temperature) === normalizedTemperature
    ? { ...line, temperature: normalizedTemperature, quantity: line.quantity + 1 }
    : line)
}

export function changeQuantity(cart, productId, temperature, delta) {
  const normalizedTemperature = normalizeTemperature(temperature)
  return cart
    .map((line) => line.product.id === productId && normalizeTemperature(line.temperature) === normalizedTemperature
      ? { ...line, temperature: normalizedTemperature, quantity: line.quantity + delta }
      : line)
    .filter((line) => line.quantity > 0)
}
