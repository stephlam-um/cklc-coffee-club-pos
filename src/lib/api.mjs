import { buildOrderStatusPayload } from './dashboard.mjs'

const endpoint = () => process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || ''
const token = () => process.env.NEXT_PUBLIC_POS_API_TOKEN || ''

async function request(action, data = {}) {
  if (!endpoint()) throw new Error('NEXT_PUBLIC_APPS_SCRIPT_URL is not configured')
  const response = await fetch(endpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token: token(), ...data }),
  })
  if (!response.ok) throw new Error(`POS API returned HTTP ${response.status}`)
  const body = await response.json()
  if (!body.ok) throw new Error(body.error || 'POS API request failed')
  return body.data
}

export const posApi = {
  getBootstrap: () => request('getBootstrap'),
  login: (staffId, pin) => request('login', { staffId, pin }),
  openShift: (staffId) => request('openShift', { staffId }),
  createTransaction: (transaction) => request('createTransaction', { transaction }),
  closeShift: (payload) => request('closeShift', payload),
  getTodayOrders: () => request('getTodayOrders'),
  updateOrderStatus: (transactionId, fulfillmentStatus, staffId) => request('updateOrderStatus', buildOrderStatusPayload(transactionId, fulfillmentStatus, staffId)),
}
