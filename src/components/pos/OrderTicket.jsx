import { formatMop, formatTemperature, paymentActionLabel } from '@/lib/presentation.mjs'

export default function OrderTicket({ cart, mode, total, submitting, pending = false, online = true, onChangeQuantity, onClear, onCheckout }) {
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0)

  return (
    <aside className="order-ticket" id="order-ticket" aria-labelledby="order-title">
      <div className="ticket-header">
        <div>
          <p className="eyebrow">Order Ticket</p>
          <h2 id="order-title">Current Order</h2>
        </div>
        <div className="ticket-tools">
          {cart.length > 0 && <button className="ticket-clear" type="button" onClick={onClear}>Clear</button>}
          <span className="ticket-number">{String(itemCount).padStart(2, '0')}</span>
        </div>
      </div>

      <div className="ticket-rule" aria-hidden="true"><span>Items</span><span>Qty</span></div>

      <div className="cart-lines">
        {cart.length ? cart.map(line => {
          const unitPrice = mode === 'STAFF' ? line.product.staffPrice : line.product.price
          return (
            <div className="cart-line" key={`${line.product.id}-${line.temperature}`}>
              <div className="line-copy">
                <strong>{line.product.name}</strong>
                <small>{[formatTemperature(line.temperature), mode === 'WASTE' ? line.product.category : `${formatMop(unitPrice)} Each`].filter(Boolean).join(' · ')}</small>
              </div>
              <div className="qty" aria-label={`Quantity for ${formatTemperature(line.temperature)} ${line.product.name}`}>
                <button type="button" disabled={pending || submitting} aria-label={`Remove one ${formatTemperature(line.temperature)} ${line.product.name}`} onClick={() => onChangeQuantity(line.product.id, line.temperature, -1)}>−</button>
                <output aria-live="polite">{line.quantity}</output>
                <button type="button" disabled={pending || submitting} aria-label={`Add one ${formatTemperature(line.temperature)} ${line.product.name}`} onClick={() => onChangeQuantity(line.product.id, line.temperature, 1)}>+</button>
              </div>
            </div>
          )
        }) : (
          <div className="cart-empty">
            <span aria-hidden="true">+</span>
            <strong>Your Ticket Is Empty</strong>
            <p>Tap a menu item to start this order.</p>
          </div>
        )}
      </div>

      <div className="checkout">
        <div className="total"><span>Total</span><strong>{formatMop(total)}</strong></div>
        {mode === 'WASTE' ? (
          <button className="button waste-action full-width" type="button" disabled={!cart.length || submitting || !online} onClick={() => onCheckout()}>
            {submitting ? 'Recording Waste…' : `Record ${itemCount || 0} Waste Item${itemCount === 1 ? '' : 's'}`}
          </button>
        ) : (
          <div className="payments">
            <button type="button" disabled={!cart.length || submitting || !online} onClick={() => onCheckout('MPAY')}>
              <span>MPay</span><small>{submitting ? 'Recording…' : paymentActionLabel(total, 'MPay')}</small>
            </button>
            <button type="button" disabled={!cart.length || submitting || !online} onClick={() => onCheckout('WECHAT_PAY')}>
              <span>WeChat Pay</span><small>{submitting ? 'Recording…' : paymentActionLabel(total, 'WeChat Pay')}</small>
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
