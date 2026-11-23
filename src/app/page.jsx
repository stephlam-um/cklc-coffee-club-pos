'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CloseShiftDialog from '@/components/pos/CloseShiftDialog'
import OrderTicket from '@/components/pos/OrderTicket'
import OverdueOrdersDialog from '@/components/pos/OverdueOrdersDialog'
import PosHeader from '@/components/pos/PosHeader'
import ProductCatalog from '@/components/pos/ProductCatalog'
import StaffLogin from '@/components/pos/StaffLogin'
import TodayDashboard from '@/components/pos/TodayDashboard'
import { dashboardStats, normalizeDashboardOrder, overduePendingOrders } from '@/lib/dashboard.mjs'
import { addProduct, calculateCartTotal, changeQuantity, EIGHTY_PERCENT_CAMPAIGN_ID, isPersonalCupCampaignActive, isRewardEligible, WASTE_REASONS } from '@/lib/domain.mjs'
import { isDemoMode, posApi } from '@/lib/api.mjs'
import { formatMop, formatRmb, orderRmbTotal, parseShiftAmount } from '@/lib/presentation.mjs'
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

import { LanguageProvider, useLanguage } from '@/components/pos/LanguageProvider'

export default function PosPage() {
  return <LanguageProvider><PosContent /></LanguageProvider>
}

function PosContent() {
  const { t, language } = useLanguage()
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
  const [discount, setDiscount] = useState(false)
  const [checkingDiscount, setCheckingDiscount] = useState(false)
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
  const dashboardRequest = useRef(0)

  function loadBootstrap() {
    setLoading(true)
    setBootstrapError('')
    posApi.getBootstrap()
      .then(setBootstrap)
      .catch(caught => setBootstrapError(`${caught.message}. Check the POS server, then try again.`))
      .finally(() => setLoading(false))
  }

  async function checkDiscountAvailability() {
    setCheckingDiscount(true)
    try {
      const result = await posApi.getBootstrap()
      setBootstrap(current => ({ ...current, discountAvailable: result.discountAvailable }))
    } catch {
      setError('Could not check discount availability. Try again.')
    } finally {
      setCheckingDiscount(false)
    }
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
  const total = pendingTransaction?.total ?? calculateCartTotal(cart, mode, new Date(), discount)
  const rewardAvailable = rewards?.availableCups || 0
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const personalCupCampaignActive = isPersonalCupCampaignActive()
  const overdueOrders = overduePendingOrders(pendingOrdersData?.orders || [], pendingOrdersData?.syncedAt)

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

  const loadDashboard = useCallback(async (background = false) => {
    const request = ++dashboardRequest.current
    if (!background) setDashboardLoading(true)
    try {
      const [result, pendingResult] = await Promise.all([
        posApi.getTodayOrders(),
        posApi.getPendingOrders(),
      ])
      if (request !== dashboardRequest.current) return
      const orders = (result.orders || []).map(normalizeDashboardOrder)
      setDashboardData({ ...result, orders, stats: result.stats || dashboardStats(orders) })
      if (pendingResult) setPendingOrdersData({ ...pendingResult, orders: (pendingResult.orders || []).map(normalizeDashboardOrder) })
      setDashboardError('')
    } catch (caught) {
      if (request === dashboardRequest.current) setDashboardError(`${caught.message}. Check the POS server and try again.`)
    } finally {
      if (request === dashboardRequest.current) setDashboardLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!staff || !online) return
    let refreshing = false
    async function refresh() {
      if (refreshing || document.hidden) return
      refreshing = true
      try {
        await loadDashboard(true)
      } finally {
        refreshing = false
      }
    }
    void refresh()
    const timer = window.setInterval(refresh, 10000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      dashboardRequest.current += 1
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [staff, online, loadDashboard])

  function changeView(nextView) {
    if (nextView === 'POS') void loadRewards()
    setActiveView(nextView)
    setError('')
    if (nextView === 'DASHBOARD' && online) void loadDashboard()
  }

  async function updateOrderStatus(transactionId, fulfillmentStatus) {
    const result = await posApi.updateOrderStatus(transactionId, fulfillmentStatus, staff.id)
    void loadRewards()
    setDashboardData(previous => previous ? {
      ...previous,
      orders: previous.orders.map(order => order.transactionId === transactionId ? { ...order, fulfillmentStatus: result.fulfillmentStatus } : order),
      stats: dashboardStats(previous.orders.map(order => order.transactionId === transactionId ? { ...order, fulfillmentStatus: result.fulfillmentStatus } : order)),
    } : previous)
    if (result.fulfillmentStatus === 'COMPLETED') updatePendingTicket(transactionId, null)
    void loadDashboard(true)
  }

  function updatePendingTicket(transactionId, changes) {
    setPendingOrdersData(previous => previous ? {
      ...previous,
      orders: previous.orders.flatMap(order => order.transactionId !== transactionId ? [order] : changes ? [{ ...order, ...changes }] : []),
    } : previous)
  }

  async function resolveOverdueOrder(transactionId, decision) {
    if (decision === 'SERVED') {
      await updateOrderStatus(transactionId, 'COMPLETED')
      return
    }
    const changes = await posApi.deferPendingOrder(transactionId, decision)
    updatePendingTicket(transactionId, changes)
    void loadDashboard(true)
  }

  async function deletePendingOrder(order) {
    if (!window.confirm(`Permanently delete ${order.type === 'WASTE' ? 'waste record' : 'order'} #${order.transactionId.slice(-6)}? This erases the transaction and its items and cannot be undone.`)) return
    await posApi.deletePendingOrder(order.transactionId)
    void loadRewards()
    setPendingOrdersData(previous => previous ? { ...previous, orders: previous.orders.filter(item => item.transactionId !== order.transactionId) } : previous)
    setDashboardData(previous => previous ? {
      ...previous,
      orders: previous.orders.filter(item => item.transactionId !== order.transactionId),
      stats: dashboardStats(previous.orders.filter(item => item.transactionId !== order.transactionId)),
    } : previous)
    void loadDashboard(true)
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
          setDiscount(pending.items.some(item => item.campaignId === EIGHTY_PERCENT_CAMPAIGN_ID))
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
    setDiscount(false)
    if (nextMode === 'STAFF_REWARD') void loadRewards()
    setNotice('')
    setError('')
  }

  function clearCart() {
    if (!cart.length && !pendingTransaction) return
    if (window.confirm(t("Clear every item from this ticket?"))) {
      try { clearPendingTransaction(window.localStorage, pendingTransaction) } catch {}
      setCart([])
      setDiscount(false)
      setPendingTransaction(null)
      setError('')
    }
  }

  async function checkout(paymentMethod = '') {
    if (!cart.length || !staff) return
    if (discount && !pendingTransaction && !bootstrap.discountAvailable) return
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
        id: createId('tx'), shiftId, staffId: staff.id, mode, cart, paymentMethod, wasteReason, discount,
      })
      if (!pendingTransaction) {
        setPendingTransaction(transaction)
        try { savePendingTransaction(window.localStorage, transaction) } catch {}
      }
      await posApi.createTransaction(transaction)
      try { clearPendingTransaction(window.localStorage, transaction) } catch {}
      setCart([])
      setPendingTransaction(null)
      const ticketNumber = transaction.transactionId.slice(-6)
      if (transaction.type === 'WASTE') {
        setNotice('Waste recorded.')
      } else if (transaction.type === 'STAFF_REWARD') {
        setNotice(`Free drink redeemed · #${ticketNumber}`)
        void loadRewards()
      } else {
        const amount = paymentMethod === 'WECHAT_PAY' ? formatRmb(orderRmbTotal(transaction)) : formatMop(transaction.total)
        setNotice(`Payment recorded · #${ticketNumber} · ${amount}`)
      }
      setMode('NORMAL_SALE')
      setDiscount(false)
      setCupType('DINE_IN')
      void loadDashboard(true)
    } catch (caught) {
      if (mode === 'STAFF_REWARD') {
        setError(caught.message === 'INSUFFICIENT_REWARDS' ? 'Not enough free drinks available. Clear this ticket to change the quantity, or complete more sales before retrying.' : `Couldn’t confirm this redemption: ${caught.message}. Your ticket is still here; retry to confirm it.`)
        void loadRewards()
      } else if (mode === 'WASTE') {
        setError(`Couldn’t record waste: ${caught.message}. Your ticket is still here; retry to confirm it.`)
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
        wechatCurrency: bootstrap.discountAvailable ? 'RMB' : 'MOP',
        note: actual.note,
      })
      setStaff(null)
      setRewards(null)
      setRewardsError('')
      setShiftId('')
      setCart([])
      setDiscount(false)
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
    return <main className="loading-shell"><div className="loading-mark" aria-hidden="true">CK</div><p aria-live="polite">{t("Loading the Counter…")}</p></main>
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
      <a className="skip-link" href="#main-content">{t("Skip to Menu")}</a>
      <div className="app-shell">
        <PosHeader staffName={staff.name} activeView={activeView} pendingCount={online && !dashboardError ? pendingOrdersData?.orders.length : undefined} onViewChange={changeView} onCloseShift={() => { setError(''); setShowClose(true) }} />

        {activeView === 'POS' && <nav className="mode-tabs" aria-label={t("Transaction type")}>
          {MODES.map(option => (
            <button key={option.id} type="button" aria-pressed={mode === option.id} onClick={() => switchMode(option.id)}>
              <span>{t(option.label)}</span><small>{t(option.description)}</small>
            </button>
          ))}
        </nav>}

        {activeView === 'POS' && <section className="reward-summary" aria-label={t("Your staff rewards")} aria-live="polite">
          <div><strong>{rewards ? (language === 'zh-Hant' ? `可兌換 ${rewardAvailable} 杯免費飲品` : `${rewardAvailable} Free Drink${rewardAvailable === 1 ? '' : 's'} Available`) : t("Staff Rewards")}</strong>
            <p>{t(rewardsError) || (rewards ? (language === 'zh-Hant' ? `已售 ${rewards.soldCups} 杯 · 已兌換 ${rewards.redeemedCups} 杯 · 再售 ${rewards.cupsToNext} 杯可兌換` : `${rewards.soldCups} cups sold · ${rewards.redeemedCups} redeemed · ${rewards.cupsToNext} more cups to the next reward`) : t("Loading your rewards…"))}</p>
            <small>{t("Every 6 completed regular-sale cups earns 1 free drink. Carries across shifts. XXL cannot be redeemed.")}</small>
          </div>
          <button className="button compact" type="button" onClick={loadRewards} disabled={!online}>{t("Refresh Rewards")}</button>
        </section>}

        <div className="announcements" aria-live="polite" aria-atomic="true">
          {activeView === 'POS' && personalCupCampaignActive && <div className="banner campaign" role="status"><strong>{t("🌱 Personal Cup Event")}</strong><span>{t("September 24–25: dine-in stays regular price; personal cups receive $3 off each drink. Takeaway cups are unavailable.")}</span></div>}
          {isDemoMode && <div className="banner notice" role="status"><strong>{t("Demo Mode")}</strong><span>{t("Using local test data only. Enter any 4-digit PIN; Supabase will not be changed.")}</span></div>}
          {!online && <div className="banner error" role="status"><strong>{t("Connection Lost")}</strong><span>{t("Reconnect before recording payment or closing the shift.")}</span></div>}
          {error && <div className="banner error" role="alert"><strong>{t("Couldn’t Complete That")}</strong><span>{t(error)}</span></div>}
          {notice && <div className="banner notice"><strong>{t("All Set")}</strong><span>{t(notice)}</span></div>}
        </div>

        {activeView === 'DASHBOARD' ? (
          <TodayDashboard data={dashboardData} pendingData={pendingOrdersData} loading={dashboardLoading} error={dashboardError} staff={staff} onRefresh={() => loadDashboard()} onUpdateStatus={updateOrderStatus} onDeletePendingOrder={deletePendingOrder} />
        ) : <main className="workspace" id="main-content">
          <div className="catalog-column">
            {mode === 'NORMAL_SALE' && personalCupCampaignActive && <section className="cup-type-picker" aria-labelledby="cup-type-title">
              <div><p className="eyebrow">{t("Cup Choice")}</p><h2 id="cup-type-title">{t("How will this drink be served?")}</h2></div>
              <div className="cup-type-actions">
                <button type="button" aria-pressed={cupType === 'DINE_IN'} onClick={() => setCupType('DINE_IN')}>{t("Dine In")} <small>{t("Regular price")}</small></button>
                <button type="button" aria-pressed={cupType === 'PERSONAL_CUP'} onClick={() => setCupType('PERSONAL_CUP')}>{t("Personal Cup")} <small>{t("$3 off each")}</small></button>
              </div>
            </section>}
            <ProductCatalog products={mode === 'STAFF_REWARD' ? products.filter(isRewardEligible) : products} mode={mode} cupType={mode === 'NORMAL_SALE' && personalCupCampaignActive ? cupType : 'DINE_IN'}
              disabled={submitting || Boolean(pendingTransaction) || (mode === 'STAFF_REWARD' && itemCount >= rewardAvailable)}
              onAdd={(product, temperature, selectedCupType) => setCart(current => addProduct(current, product, temperature, selectedCupType))} />
            {mode === 'WASTE' && (
              <section className="reason-wrap" aria-labelledby="waste-reason-title">
                <div><p className="eyebrow">{t("Required Detail")}</p><h2 id="waste-reason-title">{t("Why Was It Wasted?")}</h2></div>
                <div className="reason-grid">
                  {WASTE_REASONS.map(reason => (
                    <button type="button" key={reason} aria-pressed={wasteReason === reason} onClick={() => setWasteReason(reason)}>{t(REASON_LABELS[reason])}</button>
                  ))}
                </div>
              </section>
            )}
          </div>

          <OrderTicket
            cart={cart}
            mode={mode}
            total={total}
            discount={discount}
            discountAvailable={bootstrap.discountAvailable}
            quotedItems={pendingTransaction?.items}
            canDiscount={staff.role === 'MANAGER' && mode === 'NORMAL_SALE' && !personalCupCampaignActive}
            onToggleDiscount={() => {
              setDiscount(!discount)
              if (!discount && !bootstrap.discountAvailable) void checkDiscountAvailability()
            }}
            checkingDiscount={checkingDiscount}
            onCheckDiscount={checkDiscountAvailability}
            submitting={submitting}
            pending={Boolean(pendingTransaction)}
            pendingPaymentMethod={pendingTransaction?.paymentMethod}
            online={online}
            rewardAvailable={rewardAvailable}
            onChangeQuantity={(productId, temperature, delta, selectedCupType) => setCart(current => changeQuantity(current, productId, temperature, delta, selectedCupType))}
            onClear={clearCart}
            onCheckout={checkout}
          />
        </main>}

        {activeView === 'POS' && cart.length > 0 && (
          <button className="mobile-order-bar" type="button" onClick={() => document.getElementById('order-ticket')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            <span><strong>{cart.reduce((sum, line) => sum + line.quantity, 0)} {t('Items')}</strong><small>{mode === 'WASTE' ? t("Waste Ticket") : formatMop(total)}</small></span>
            <span>{mode === 'STAFF_REWARD' ? t("Review & Redeem") : t("Review & Pay")} <b aria-hidden="true">↑</b></span>
          </button>
        )}
      </div>

      {pendingOrdersData?.remindersEnabled && online && !dashboardError && !showClose && !submitting && !pendingTransaction && cart.length === 0 && overdueOrders.length > 0 && (
        <OverdueOrdersDialog orders={overdueOrders} syncedAt={pendingOrdersData.syncedAt} onResolve={resolveOverdueOrder} />
      )}

      {showClose && (
        <CloseShiftDialog
          actual={actual}
          wechatCurrency={bootstrap.discountAvailable ? 'RMB' : 'MOP'}
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
