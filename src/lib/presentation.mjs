const mopFormatter = new Intl.NumberFormat('en-MO', {
  style: 'currency',
  currency: 'MOP',
  currencyDisplay: 'code',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatMop(value) {
  return mopFormatter.format(Number(value) || 0)
}

export function paymentActionLabel(total, method) {
  return `Pay ${formatMop(total)} with ${method}`
}

export function formatTemperature(value) {
  const labels = { HOT: 'Hot', ICED: 'Iced' }
  return labels[String(value || '').toUpperCase()] || ''
}

export function getInitials(name) {
  const initials = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('')

  return initials || '?'
}

export function possessiveName(name) {
  const value = String(name || '').trim()
  return /s$/i.test(value) ? `${value}’` : `${value}’s`
}

export function parseShiftAmount(input) {
  const value = String(input ?? '').trim()
  if (!value) return 0
  if (value.startsWith('-')) throw new Error('Payment totals must be zero or more.')
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Enter a valid amount with up to 2 decimal places.')
  const amount = Number(value)
  if (!Number.isFinite(amount)) throw new Error('Enter a valid amount with up to 2 decimal places.')
  return amount
}
