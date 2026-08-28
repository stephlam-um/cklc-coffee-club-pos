import { createHmac, timingSafeEqual } from 'node:crypto'
import { readServerEnv } from './env.mjs'

const COOKIE_NAME = 'pos_session'
const DEFAULT_MAX_AGE = 60 * 60 * 12

function encode(value) { return Buffer.from(value).toString('base64url') }
function decode(value) { return Buffer.from(value, 'base64url').toString('utf8') }
function signature(body, secret) { return createHmac('sha256', secret).update(body).digest('base64url') }

export function createSessionToken(staff, secret, now = Date.now(), maxAge = DEFAULT_MAX_AGE) {
  const body = encode(JSON.stringify({ id: String(staff.id), role: String(staff.role || 'STAFF'), exp: Math.floor(now / 1000) + maxAge }))
  return `${body}.${signature(body, secret)}`
}

export function readSessionToken(token, secret, now = Date.now()) {
  try {
    const [body, supplied] = String(token || '').split('.')
    if (!body || !supplied) return null
    const expected = signature(body, secret)
    const expectedBytes = Buffer.from(expected)
    const suppliedBytes = Buffer.from(supplied)
    if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return null
    const payload = JSON.parse(decode(body))
    if (!payload.id || !payload.exp || payload.exp <= Math.floor(now / 1000)) return null
    return { id: String(payload.id), role: String(payload.role || 'STAFF') }
  } catch {
    return null
  }
}

export function createStaffSession(staff) {
  const env = readServerEnv()
  return createSessionToken(staff, env.sessionSecret)
}

export function readStaffSession(request) {
  const env = readServerEnv()
  const cookieHeader = request?.headers?.get?.('cookie') || ''
  const token = cookieHeader.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1)
  return readSessionToken(token, env.sessionSecret)
}

export function setSessionCookie(response, token, maxAge = DEFAULT_MAX_AGE) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.headers.set('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`)
  return response
}

export { COOKIE_NAME, DEFAULT_MAX_AGE }
