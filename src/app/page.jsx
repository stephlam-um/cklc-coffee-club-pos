'use client'

import { useEffect, useMemo, useState } from 'react'
import CloseShiftDialog from '@/components/pos/CloseShiftDialog'
import OrderTicket from '@/components/pos/OrderTicket'
import PosHeader from '@/components/pos/PosHeader'
import ProductCatalog from '@/components/pos/ProductCatalog'
import StaffLogin from '@/components/pos/StaffLogin'
import TodayDashboard from '@/components/pos/TodayDashboard'
import { dashboardStats, normalizeDashboardOrder } from '@/lib/dashboard.mjs'
import { addProduct, calculateCartTotal, changeQuantity, WASTE_REASONS } from '@/lib/domain.mjs'
import { posApi } from '@/lib/api.mjs'
import { formatMop, parseShiftAmount } from '@/lib/presentation.mjs'
import { buildTransactionPayload, createId } from '@/lib/transactions.mjs'

const MODES = [
  { id: 'NORMAL_SALE', label: 'Sale', description: 'Regular Price' },
  { id: 'STAFF', label: 'Staff Price', description: 'Team Discount' },
  { id: 'WASTE', label: 'Waste', description: 'Log an Item' },
]

const REASON_LABELS = {
  MADE_WRONG: 'Made Wrong',
  CALIBRATION: 'Calibration',
  SPILLED: 'Spilled',
  OTHER: 'Other',
}

export default function PosPage() {
  const [bootstrap, setBootstrap] = useState({ products: [], staff: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [bootstrapError, setBootstrapError] = useState('')
  const [staff, setStaff] = useState(null)
  const [pinFor, setPinFor] = useState(null)
  const [pin, setPin] = useState('')
  const [shiftId, setShiftId] = useState('')
  const [mode, setMode] = useState('NORMAL_SALE')
  const [cart, setCart] = useState([])
  const [wasteReason, setWasteReason] = useState('MADE_WRONG')
  const [submitting, setSubmitting] = useState(false)
  const [pendingTransaction, setPendingTransaction] = useState(null)
  const [notice, setNotice] = useState('')
  const [showClose, setShowClose] = useState(false)
  const [actual, setActual] = useState({ mpay: '', wechat: '', note: '' })
  const [activeView, setActiveView] = useState('POS')
  const [dashboardData, setDashboardData] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState('')
  const [online, setOnline] = useState(true)

  function loadBootstrap() {
    setLoading(true)
    setBootstrapError('')
    posApi.getBootstrap()
      .then(setBootstrap)
      .catch(caught => setBootstrapError(`${caught.message}. Check the POS server, then try again.`))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadBootstrap()
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const products = useMemo(
    () => [...bootstrap.products].filter(product => product.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [bootstrap.products],
  )
  const activeStaff = useMemo(() => bootstrap.staff.filter(member => member.active), [bootstrap.staff])
  const total = calculateCartTotal(cart, mode)

  async function loadDashboard() {
    setDashboardLoading(true)
    setDashboardError('')
    try {
      const result = await posApi.getTodayOrders()
      const orders = (result.orders || []).map(normalizeDashboardOrder)
      setDashboardData({ ...result, orders, stats: result.stats || dashboardStats(orders) })
    } catch (caught) {
      setDashboardError(`${caught.message}. Check the POS server and try again.`)
    } finally {
      setDashboardLoading(false)
    }
  }

  function changeView(nextView) {
    setActiveView(nextView)
    setError('')
    if (nextView === 'DASHBOARD' && !dashboardData) loadDashboard()
  }

  async function updateOrderStatus(transactionId, fulfillmentStatus) {
    const result = await posApi.updateOrderStatus(transactionId, fulfillmentStatus, staff.id)
    setDashboardData(previous => previous ? {
      ...previous,
      orders: previous.orders.map(order => order.transactionId === transactionId ? { ...order, fulfillmentStatus: result.fulfillmentStatus } : order),
      stats: dashboardStats(previous.orders.map(order => order.transactionId === transactionId ? { ...order, fulfillmentStatus: result.fulfillmentStatus } : order)),
    } : previous)
  }

  async function login(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const result = await posApi.login(pinFor.id, pin)
      const shift = await posApi.openShift(result.staff.id)
      setStaff(result.staff)
      setShiftId(shift.shiftId)
      setActiveView('POS')
      setPinFor(null)
      setPin('')
    } catch (caught) {
      setError(`${caught.message}. Check the PIN and try again.`)
    } finally {
      setSubmitting(false)
    }
  }

  function selectStaff(member) {
    setPinFor(member)
    setPin('')
    setError('')
  }

  function cancelPin() {
    setPinFor(null)
    setPin('')
    setError('')
  }

  function switchMode(nextMode) {
    if (nextMode === mode) return
    if (cart.length) {
      setError('Complete or clear the current ticket before changing transaction type.')
      return
    }
    setMode(nextMode)
    setNotice('')
    setError('')
  }

  function clearCart() {
    if (!cart.length) return
    if (window.confirm('Clear every item from this ticket?')) {
      setCart([])
      setPendingTransaction(null)
      setError('')
    }
  }

  async function checkout(paymentMethod = '') {
    if (!cart.length || !staff) return
    if (pendingTransaction && (pendingTransaction.paymentMethod !== paymentMethod || pendingTransaction.type !== mode || pendingTransaction.wasteReason !== wasteReason)) {
      setError('Retry the same payment method to confirm the existing ticket, or clear it before starting over.')
      return
    }
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const transaction = pendingTransaction || buildTransactionPayload({
        id: createId('tx'), shiftId, staffId: staff.id, mode, cart, paymentMethod, wasteReason,
      })
      if (!pendingTransaction) setPendingTransaction(transaction)
      await posApi.createTransaction(transaction)
      setCart([])
      setPendingTransaction(null)
      setNotice(mode === 'WASTE' ? 'Waste Recorded. The ticket is ready for the next entry.' : 'Payment Recorded. The counter is ready for the next order.')
    } catch (caught) {
      setError(`${caught.code === 'CONFLICTING_TRANSACTION' ? 'This ticket changed while it was being retried.' : 'Couldn’t confirm this payment. Retry to check the same transaction.'} Your order is still here.`)
    } finally {
      setSubmitting(false)
    }
  }

  async function closeShift(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const mpayActual = parseShiftAmount(actual.mpay)
      const wechatActual = parseShiftAmount(actual.wechat)
      await posApi.closeShift({
        shiftId,
        staffId: staff.id,
        mpayActual,
        wechatActual,
        note: actual.note,
      })
      setStaff(null)
      setShiftId('')
      setCart([])
      setShowClose(false)
      setActual({ mpay: '', wechat: '', note: '' })
      setDashboardData(null)
      setActiveView('POS')
      setNotice('Shift Closed.')
    } catch (caught) {
      setError(`${caught.message}. Check the totals and try again.`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <main className="loading-shell"><div className="loading-mark" aria-hidden="true">CK</div><p aria-live="polite">Loading the Counter…</p></main>
  }

  if (!staff) {
    return (
      <StaffLogin
        staff={activeStaff}
        selectedStaff={pinFor}
        pin={pin}
        error={error}
        bootstrapError={bootstrapError}
        submitting={submitting}
        onSelect={selectStaff}
        onPinChange={setPin}
        onCancel={cancelPin}
        onRetry={loadBootstrap}
        onSubmit={login}
      />
    )
  }

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to Menu</a>
      <div className="app-shell">
        <PosHeader staffName={staff.name} activeView={activeView} onViewChange={changeView} onCloseShift={() => { setError(''); setShowClose(true) }} />

        {activeView === 'POS' && <nav className="mode-tabs" aria-label="Transaction type">
          {MODES.map(option => (
            <button key={option.id} type="button" aria-pressed={mode === option.id} onClick={() => switchMode(option.id)}>
              <span>{option.label}</span><small>{option.description}</small>
            </button>
          ))}
        </nav>}

        <div className="announcements" aria-live="polite" aria-atomic="true">
          {!online && <div className="banner error" role="status"><strong>Connection Lost</strong><span>Reconnect before recording payment or closing the shift.</span></div>}
          {error && <div className="banner error" role="alert"><strong>Couldn’t Complete That</strong><span>{error}</span></div>}
          {notice && <div className="banner notice"><strong>All Set</strong><span>{notice}</span></div>}
        </div>

        {activeView === 'DASHBOARD' ? (
          <TodayDashboard data={dashboardData} loading={dashboardLoading} error={dashboardError} staff={staff} onRefresh={loadDashboard} onUpdateStatus={updateOrderStatus} />
        ) : <main className="workspace" id="main-content">
          <div className="catalog-column">
            <ProductCatalog products={products} mode={mode} onAdd={(product, temperature) => setCart(current => addProduct(current, product, temperature))} />
            {mode === 'WASTE' && (
              <section className="reason-wrap" aria-labelledby="waste-reason-title">
                <div><p className="eyebrow">Required Detail</p><h2 id="waste-reason-title">Why Was It Wasted?</h2></div>
                <div className="reason-grid">
                  {WASTE_REASONS.map(reason => (
                    <button type="button" key={reason} aria-pressed={wasteReason === reason} onClick={() => setWasteReason(reason)}>{REASON_LABELS[reason]}</button>
                  ))}
                </div>
              </section>
            )}
          </div>

          <OrderTicket
            cart={cart}
            mode={mode}
            total={total}
            submitting={submitting}
            online={online}
            onChangeQuantity={(productId, temperature, delta) => setCart(current => changeQuantity(current, productId, temperature, delta))}
            onClear={clearCart}
            onCheckout={checkout}
          />
        </main>}

        {activeView === 'POS' && cart.length > 0 && (
          <button className="mobile-order-bar" type="button" onClick={() => document.getElementById('order-ticket')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            <span><strong>{cart.reduce((sum, line) => sum + line.quantity, 0)} Items</strong><small>{mode === 'WASTE' ? 'Waste Ticket' : formatMop(total)}</small></span>
            <span>Review &amp; Pay <b aria-hidden="true">↑</b></span>
          </button>
        )}
      </div>

      {showClose && (
        <CloseShiftDialog
          actual={actual}
          submitting={submitting}
          error={error}
          onChange={setActual}
          onCancel={() => { if (!submitting) { setShowClose(false); setError('') } }}
          onSubmit={closeShift}
        />
      )}
    </>
  )
}
