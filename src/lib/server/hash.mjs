import { createHash, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto'

const ITERATIONS = 120_000
const KEY_LENGTH = 32
const DIGEST = 'sha256'

function derive(pin, salt, iterations = ITERATIONS) {
  return new Promise((resolve, reject) => {
    pbkdf2(String(pin), salt, iterations, KEY_LENGTH, DIGEST, (error, key) => error ? reject(error) : resolve(key))
  })
}

export async function hashPin(pin) {
  const salt = randomBytes(16)
  const derived = await derive(pin, salt)
  return `pbkdf2$${ITERATIONS}$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

export async function verifyPin(pin, encoded) {
  try {
    const [scheme, iterationsText, saltText, hashText] = String(encoded).split('$')
    const iterations = Number(iterationsText)
    if (scheme !== 'pbkdf2' || !Number.isInteger(iterations) || iterations < 50_000 || !saltText || !hashText) return false
    const expected = Buffer.from(hashText, 'base64url')
    const actual = await derive(pin, Buffer.from(saltText, 'base64url'), iterations)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

export function fingerprintTransaction(input) {
  return createHash('sha256').update(stableStringify({
    shiftId: input.shiftId,
    staffId: input.staffId,
    type: input.type,
    items: input.items,
    total: input.total,
    paymentMethod: input.paymentMethod || '',
    wasteReason: input.wasteReason || '',
  })).digest('hex')
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
