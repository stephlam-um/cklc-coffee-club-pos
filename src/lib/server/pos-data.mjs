import { randomUUID } from 'node:crypto'
import { verifyPin } from './hash.mjs'
import { dashboardStats, normalizeDashboardOrder } from '../dashboard.mjs'

export async function getBootstrap(supabase) {
  const [products, staff] = await Promise.all([
    supabase.from('products').select('id,name,category,price,staff_price,active,sort_order').eq('active', true).order('sort_order'),
    supabase.from('staff').select('id,name,role,active').eq('active', true).order('name'),
  ])
  if (products.error) throw products.error
  if (staff.error) throw staff.error
  return {
    products: (products.data || []).map(row => ({ id: row.id, name: row.name, category: row.category, price: Number(row.price), staffPrice: Number(row.staff_price), active: row.active, sortOrder: Number(row.sort_order) })),
    staff: staff.data || [],
  }
}

export async function loginStaff(supabase, staffId, pin) {
  const { data, error } = await supabase.from('staff').select('id,name,role,active,pin_hash').eq('id', String(staffId)).eq('active', true).maybeSingle()
  if (error) throw error
  if (!data || !(await verifyPin(pin, data.pin_hash))) throw Object.assign(new Error('Invalid PIN'), { code: 'UNAUTHORIZED' })
  return { id: data.id, name: data.name, role: data.role, active: data.active }
}

export async function openShift(supabase, staffId) {
  const existing = await supabase.from('shifts').select('id').eq('staff_id', staffId).eq('status', 'OPEN').maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return { shiftId: existing.data.id }
  const shiftId = `shift-${randomUUID()}`
  const created = await supabase.from('shifts').insert({ id: shiftId, staff_id: staffId, status: 'OPEN', sheet_sync_status: 'NOT_READY' }).select('id').single()
  if (!created.error) return { shiftId: created.data.id }
  if (created.error.code === '23505') {
    const retry = await supabase.from('shifts').select('id').eq('staff_id', staffId).eq('status', 'OPEN').single()
    if (!retry.error) return { shiftId: retry.data.id }
  }
  throw created.error
}

export async function getTodayOrders(supabase) {
  const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.POS_TIMEZONE || 'Asia/Macau', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const start = new Date(`${dateKey}T00:00:00+08:00`).toISOString()
  const { data, error } = await supabase.from('transactions').select('id,created_at,shift_id,staff_id,type,total,payment_method,waste_reason,fulfillment_status,completed_at,completed_by,staff:staff_id(name),transaction_items(*)').eq('status', 'COMPLETED').gte('created_at', start).order('created_at', { ascending: true })
  if (error) throw error
  const orders = (data || []).map(row => normalizeDashboardOrder({
    transactionId: row.id, timestamp: row.created_at, shiftId: row.shift_id, staffId: row.staff_id,
    staffName: row.staff?.name || row.staff_id, type: row.type,
    items: (row.transaction_items || []).map(item => ({ productId: item.product_id, name: item.product_name, temperature: item.temperature, quantity: item.quantity, unitPrice: Number(item.unit_price), lineTotal: Number(item.line_total) })),
    total: Number(row.total), paymentMethod: row.payment_method, wasteReason: row.waste_reason,
    fulfillmentStatus: row.fulfillment_status, completedAt: row.completed_at, completedBy: row.completed_by,
  }))
  return { date: dateKey, timezone: process.env.POS_TIMEZONE || 'Asia/Macau', orders, stats: dashboardStats(orders), syncedAt: new Date().toISOString() }
}

export async function updateOrderStatus(supabase, transactionId, fulfillmentStatus, staffId) {
  if (!['PENDING', 'COMPLETED'].includes(fulfillmentStatus)) throw new Error('Invalid fulfillment status')
  const existing = await supabase.from('transactions').select('id,type').eq('id', transactionId).maybeSingle()
  if (existing.error) throw existing.error
  if (!existing.data) throw Object.assign(new Error('Transaction not found'), { code: 'NOT_FOUND' })
  if (existing.data.type === 'WASTE') throw new Error('Waste entries do not have fulfillment status')
  const update = { fulfillment_status: fulfillmentStatus, completed_at: fulfillmentStatus === 'COMPLETED' ? new Date().toISOString() : null, completed_by: fulfillmentStatus === 'COMPLETED' ? staffId : null }
  const result = await supabase.from('transactions').update(update).eq('id', transactionId).select('id,fulfillment_status').single()
  if (result.error) throw result.error
  return { transactionId: result.data.id, fulfillmentStatus: result.data.fulfillment_status }
}

export async function closeShift(supabase, { shiftId, staffId, mpayActual, wechatActual, note }) {
  const result = await supabase.rpc('close_shift', { p_shift_id: shiftId, p_staff_id: staffId, p_mpay_actual: mpayActual, p_wechat_actual: wechatActual, p_note: note || '' })
  if (result.error) throw result.error
  return result.data
}
