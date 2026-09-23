export const MODES = Object.freeze(['NORMAL_SALE', 'STAFF', 'STAFF_REWARD', 'WASTE'])

export function isRewardEligible(product) {
  return !/xxl/i.test(`${product.name || ''} ${product.category || ''}`)
}
export const PAYMENT_METHODS = Object.freeze(['MPAY', 'WECHAT_PAY'])
export const WASTE_REASONS = Object.freeze(['MADE_WRONG', 'CALIBRATION', 'SPILLED', 'OTHER'])
export const DRINK_TEMPERATURES = Object.freeze(['HOT', 'ICED'])
export const CUP_TYPES = Object.freeze(['DINE_IN', 'PERSONAL_CUP'])
export const PERSONAL_CUP_CAMPAIGN_ID = 'PERSONAL_CUP_2026'
export const PERSONAL_CUP_DISCOUNT = 3

export function normalizeCupType(cupType) {
  return CUP_TYPES.includes(cupType) ? cupType : 'DINE_IN'
}

export function isPersonalCupCampaignActive(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Macau', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const macauDate = `${values.year}-${values.month}-${values.day}`
  return macauDate >= '2026-09-24' && macauDate <= '2026-09-25'
}

export function normalizeTemperature(temperature) {
  const value = String(temperature || '').toUpperCase()
  return DRINK_TEMPERATURES.includes(value) ? value : 'ICED'
}

export function getUnitPrice(product, mode, cupType = 'DINE_IN', now = new Date()) {
  if (mode === 'STAFF') return Number(product.staffPrice)
  if (mode === 'NORMAL_SALE') {
    const price = Number(product.price)
    return normalizeCupType(cupType) === 'PERSONAL_CUP' && isPersonalCupCampaignActive(now)
      ? Math.max(0, price - PERSONAL_CUP_DISCOUNT)
      : price
  }
  return 0
}

export function getRmbUnitPrice(mopUnitPrice) {
  const mopCents = Math.round(Number(mopUnitPrice) * 100)
  if (!Number.isFinite(mopCents) || mopCents < 200) throw new Error('RMB price requires a MOP price of at least 2.00')
  return (mopCents - 200) / 100
}

export function calculateCartTotal(cart, mode, now = new Date()) {
  return cart.reduce((sum, line) => sum + getUnitPrice(line.product, mode, line.cupType, now) * line.quantity, 0)
}

export function addProduct(cart, product, temperature = 'ICED', cupType) {
  const normalizedTemperature = normalizeTemperature(temperature)
  const normalizedCupType = normalizeCupType(cupType)
  const existing = cart.find((line) => line.product.id === product.id && normalizeTemperature(line.temperature) === normalizedTemperature && normalizeCupType(line.cupType) === normalizedCupType)
  const nextLine = { product, temperature: normalizedTemperature, quantity: 1, ...(cupType ? { cupType: normalizedCupType } : {}) }
  if (!existing) return [...cart, nextLine]
  return cart.map((line) => line.product.id === product.id && normalizeTemperature(line.temperature) === normalizedTemperature && normalizeCupType(line.cupType) === normalizedCupType
    ? { ...line, temperature: normalizedTemperature, quantity: line.quantity + 1 }
    : line)
}

export function changeQuantity(cart, productId, temperature, delta, cupType = 'DINE_IN') {
  const normalizedTemperature = normalizeTemperature(temperature)
  const normalizedCupType = normalizeCupType(cupType)
  return cart
    .map((line) => line.product.id === productId && normalizeTemperature(line.temperature) === normalizedTemperature && normalizeCupType(line.cupType) === normalizedCupType
      ? { ...line, temperature: normalizedTemperature, quantity: line.quantity + delta }
      : line)
    .filter((line) => line.quantity > 0)
}
