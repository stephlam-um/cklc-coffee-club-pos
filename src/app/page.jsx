'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import CloseShiftDialog from '@/components/pos/CloseShiftDialog'
import OrderTicket from '@/components/pos/OrderTicket'
import PosHeader from '@/components/pos/PosHeader'
import ProductCatalog from '@/components/pos/ProductCatalog'
import StaffLogin from '@/components/pos/StaffLogin'
import TodayDashboard from '@/components/pos/TodayDashboard'
import { dashboardStats, normalizeDashboardOrder } from '@/lib/dashboard.mjs'
import { addProduct, calculateCartTotal, changeQuantity, isPersonalCupCampaignActive, isRewardEligible, WASTE_REASONS } from '@/lib/domain.mjs'
import { isDemoMode, posApi } from '@/lib/api.mjs'
import { formatMop, parseShiftAmount } from '@/lib/presentation.mjs'
import {
  buildTransactionPayload,
  clearPendingTransaction,
  createId,
  loadPendingTransaction,
  restoreCheckoutDraft,
  savePendingTransaction,
} from '@/lib/transactions.mjs'

const MODES = [
  { id: 'NORMAL_SALE', label: 'Sale', description: 'Regular Price' },
  { id: 'STAFF', label: 'Staff Price', description: 'Team Discount' },
  { id: 'STAFF_REWARD', label: 'Free Drink', description: 'Staff Rewards' },
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
  const [cupType, setCupType] = useState('DINE_IN')
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
  const [pendingOrdersData, setPendingOrdersData] = useState(null)
  const [online, setOnline] = useState(true)
  const [rewards, setRewards] = useState(null)
  const [rewardsError, setRewardsError] = useState('')
  const checkoutInFlight = useRef(false)

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
  const rewardAvailable = rewards?.availableCups || 0
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const personalCupCampaignActive = isPersonalCupCampaignActive()

  async function loadRewards() {
    try {
      const result = await posApi.getStaffRewards()
      setRewards(result)
      setRewardsError('')
    } catch {
      setRewards(null)
      setRewardsError('Could not load rewards. Refresh before redeeming.')
    }
  }

  useEffect(() => {
    if (!staff) return
    loadRewards()
    const refresh = () => loadRewards()
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [staff])

  async function loadDashboard() {
    void loadRewards()
    setDashboardLoading(true)
    setDashboardError('')
    try {
      const [result, pendingResult] = await Promise.all([
        posApi.getTodayOrders(),
        staff?.role === 'MANAGER' ? posApi.getPendingOrders() : Promise.resolve(null),
      ])
      const orders = (result.orders || []).map(normalizeDashboardOrder)
      setDashboardData({ ...result, orders, stats: result.stats || dashboardStats(orders) })
      if (pendingResult) setPendingOrdersData({ ...pendingResult, orders: (pendingResult.orders || []).map(normalizeDashboardOrder) })
      return true
    } catch (caught) {
      setDashboardError(`${caught.message}. Check the POS server and try again.`)
      return false
    } finally {
      setDashboardLoading(false)
    }
  }

  function changeView(nextView) {
    if (nextView === 'POS') void loadRewards()
    setActiveView(nextView)
    setError('')
    if (nextView === 'DASHBOARD' && !dashboardData) loadDashboard()
  }

  async function updateOrderStatus(transactionId, fulfillmentStatus) {
    const result = await posApi.updateOrderStatus(transactionId, fulfillmentStatus, staff.id)
    void loadRewards()
    setDashboardData(previous => previous ? {
      ...previous,
      orders: previous.orders.map(order => order.transactionId === transactionId ? { ...order, fulfillmentStatus: result.fulfillmentStatus } : order),
      stats: dashboardStats(previous.orders.map(order => order.transactionId === transactionId ? { ...order, fulfillmentStatus: result.fulfillmentStatus } : order)),
    } : previous)
    if (staff.role === 'MANAGER') {
      const pendingResult = await posApi.getPendingOrders()
      setPendingOrdersData({ ...pendingResult, orders: (pendingResult.orders || []).map(normalizeDashboardOrder) })
    }
  }

  async function deletePendingOrder(order) {
    if (!window.confirm(`Permanently delete order #${order.transactionId.slice(-6)}? This erases the transaction and its items and cannot be undone.`)) return
    await posApi.deletePendingOrder(order.transactionId)
    void loadRewards()
    setPendingOrdersData(previous => previous ? { ...previous, orders: previous.orders.filter(item => item.transactionId !== order.transactionId) } : previous)
    setDashboardData(previous => previous ? {
      ...previous,
      orders: previous.orders.filter(item => item.transactionId !== order.transactionId),
      stats: dashboardStats(previous.orders.filter(item => item.transactionId !== order.transactionId)),
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
      try {
        const pending = loadPendingTransaction(window.localStorage, { staffId: result.staff.id, shiftId: shift.shiftId })
        const restored = pending ? restoreCheckoutDraft(bootstrap.products, pending) : null
        if (restored) {
          setPendingTransaction(pending)
          setCart(restored.cart)
          setMode(restored.mode)
          setWasteReason(restored.wasteReason)
          setNotice('Unconfirmed ticket restored. Retry the same payment or clear it.')
        }
      } catch {}
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
    if (nextMode === 'STAFF_REWARD') void loadRewards()
    setNotice('')
    setError('')
  }

  function clearCart() {
    if (!cart.length && !pendingTransaction) return
    if (window.confirm('Clear every item from this ticket?')) {
      try { clearPendingTransaction(window.localStorage, pendingTransaction) } catch {}
      setCart([])
      setPendingTransaction(null)
      setError('')
    }
  }

  async function checkout(paymentMethod = '') {
    if (!cart.length || !staff) return
    if (checkoutInFlight.current) return
    if (pendingTransaction && (pendingTransaction.paymentMethod !== paymentMethod || pendingTransaction.type !== mode || (mode === 'WASTE' && pendingTransaction.wasteReason !== wasteReason))) {
      setError('Retry the same payment method to confirm the existing ticket, or clear it before starting over.')
      return
    }
    checkoutInFlight.current = true
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const transaction = pendingTransaction || buildTransactionPayload({
        id: createId('tx'), shiftId, staffId: staff.id, mode, cart, paymentMethod, wasteReason,
      })
      if (!pendingTransaction) {
        setPendingTransaction(transaction)
        try { savePendingTransaction(window.localStorage, transaction) } catch {}
      }
      await posApi.createTransaction(transaction)
      try { clearPendingTransaction(window.localStorage, transaction) } catch {}
      setCart([])
      setPendingTransaction(null)
      setNotice(transaction.type === 'STAFF_REWARD' ? 'Free drink redeemed. Loading today’s orders…' : transaction.type === 'WASTE' ? 'Waste recorded. Loading today’s orders…' : 'Payment recorded. Loading today’s orders…')
      setActiveView('DASHBOARD')
      const refreshed = await loadDashboard()
      if (!refreshed) setNotice(transaction.type === 'STAFF_REWARD' ? 'Free drink redeemed. Tap Sync Today to refresh the order list.' : transaction.type === 'WASTE' ? 'Waste recorded. Tap Sync Today to refresh the order list.' : 'Payment recorded. Tap Sync Today to refresh the order list.')
    } catch (caught) {
      if (mode === 'STAFF_REWARD') {
        setError(caught.message === 'INSUFFICIENT_REWARDS' ? 'Not enough free drinks available. Clear this ticket to change the quantity, or complete more sales before retrying.' : `Couldn’t confirm this redemption: ${caught.message}. Your ticket is still here; retry to confirm it.`)
        void loadRewards()
      } else {
        setError(`${caught.code === 'CONFLICTING_TRANSACTION' ? 'This ticket changed while it was being retried.' : 'Couldn’t confirm this payment. Retry to check the same transaction.'} Your order is still here.`)
      }
    } finally {
      checkoutInFlight.current = false
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
      setRewards(null)
      setRewardsError('')
      setShiftId('')
      setCart([])
      setShowClose(false)
      setActual({ mpay: '', wechat: '', note: '' })
      setDashboardData(null)
      setPendingOrdersData(null)
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

        {activeView === 'POS' && <section className="reward-summary" aria-label="Your staff rewards" aria-live="polite">
          <div><strong>{rewards ? `${rewardAvailable} Free Drink${rewardAvailable === 1 ? '' : 's'} Available` : 'Staff Rewards'}</strong>
            <p>{rewardsError || (rewards ? `${rewards.soldCups} cups sold · ${rewards.redeemedCups} redeemed · ${rewards.cupsToNext} more cups to the next reward` : 'Loading your rewards…')}</p>
            <small>Every 6 completed regular-sale cups earns 1 free drink. Carries across shifts. XXL cannot be redeemed.</small>
          </div>
          <button className="button compact" type="button" onClick={loadRewards} disabled={!online}>Refresh Rewards</button>
        </section>}

        <div className="announcements" aria-live="polite" aria-atomic="true">
          {activeView === 'POS' && personalCupCampaignActive && <div className="banner campaign" role="status"><strong>🌱 Personal Cup Event</strong><span>September 24–25: dine-in stays regular price; personal cups receive $3 off each drink. Takeaway cups are unavailable.</span></div>}
          {isDemoMode && <div className="banner notice" role="status"><strong>Demo Mode</strong><span>Using local test data only. Enter any 4-digit PIN; Supabase will not be changed.</span></div>}
          {!online && <div className="banner error" role="status"><strong>Connection Lost</strong><span>Reconnect before recording payment or closing the shift.</span></div>}
          {error && <div className="banner error" role="alert"><strong>Couldn’t Complete That</strong><span>{error}</span></div>}
          {notice && <div className="banner notice"><strong>All Set</strong><span>{notice}</span></div>}
        </div>

        {activeView === 'DASHBOARD' ? (
          <TodayDashboard data={dashboardData} pendingData={pendingOrdersData} loading={dashboardLoading} error={dashboardError} staff={staff} onRefresh={loadDashboard} onUpdateStatus={updateOrderStatus} onDeletePendingOrder={deletePendingOrder} />
        ) : <main className="workspace" id="main-content">
          <div className="catalog-column">
            {mode === 'NORMAL_SALE' && personalCupCampaignActive && <section className="cup-type-picker" aria-labelledby="cup-type-title">
              <div><p className="eyebrow">Cup Choice</p><h2 id="cup-type-title">How will this drink be served?</h2></div>
              <div className="cup-type-actions">
                <button type="button" aria-pressed={cupType === 'DINE_IN'} onClick={() => setCupType('DINE_IN')}>Dine In <small>Regular price</small></button>
                <button type="button" aria-pressed={cupType === 'PERSONAL_CUP'} onClick={() => setCupType('PERSONAL_CUP')}>Personal Cup <small>$3 off each</small></button>
              </div>
            </section>}
            <ProductCatalog products={mode === 'STAFF_REWARD' ? products.filter(isRewardEligible) : products} mode={mode} cupType={mode === 'NORMAL_SALE' && personalCupCampaignActive ? cupType : 'DINE_IN'}
              disabled={submitting || Boolean(pendingTransaction) || (mode === 'STAFF_REWARD' && itemCount >= rewardAvailable)}
              onAdd={(product, temperature, selectedCupType) => setCart(current => addProduct(current, product, temperature, selectedCupType))} />
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
            pending={Boolean(pendingTransaction)}
            online={online}
            rewardAvailable={rewardAvailable}
            onChangeQuantity={(productId, temperature, delta, selectedCupType) => setCart(current => changeQuantity(current, productId, temperature, delta, selectedCupType))}
            onClear={clearCart}
            onCheckout={checkout}
          />
        </main>}

        {activeView === 'POS' && cart.length > 0 && (
          <button className="mobile-order-bar" type="button" onClick={() => document.getElementById('order-ticket')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            <span><strong>{cart.reduce((sum, line) => sum + line.quantity, 0)} Items</strong><small>{mode === 'WASTE' ? 'Waste Ticket' : formatMop(total)}</small></span>
            <span>{mode === 'STAFF_REWARD' ? 'Review & Redeem' : 'Review & Pay'} <b aria-hidden="true">↑</b></span>
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
