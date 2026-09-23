import { formatMop } from '@/lib/presentation.mjs'
import { DRINK_TEMPERATURES, getUnitPrice } from '@/lib/domain.mjs'

const TEMPERATURE_LABELS = { HOT: 'Hot', ICED: 'Iced' }

const MODE_COPY = {
  NORMAL_SALE: { eyebrow: 'Regular Menu', title: 'What Can We Make?', hint: 'Choose Hot or Iced to add a drink.' },
  STAFF: { eyebrow: 'Team Menu', title: 'Staff-Price Drinks', hint: 'Choose Hot or Iced. Staff pricing is applied automatically.' },
  STAFF_REWARD: { eyebrow: 'Staff Rewards', title: 'Choose Your Free Drink', hint: 'Redeem 1 free drink for every 6 completed sale cups. XXL excluded.' },
  WASTE: { eyebrow: 'Waste Log', title: 'What Was Wasted?', hint: 'Choose Hot or Iced, then log the item.' },
}

export default function ProductCatalog({ products, mode, cupType = 'DINE_IN', onAdd, disabled = false }) {
  const copy = MODE_COPY[mode]

  return (
    <section className="catalog" aria-labelledby="catalog-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="catalog-title">{copy.title}</h2>
          <p>{copy.hint}</p>
        </div>
        <span className="menu-count">{products.length} Items</span>
      </div>

      {products.length ? (
        <div className="product-grid">
          {products.map(product => (
            <div className="product-button" key={product.id}>
              <span className="product-category">{product.category}</span>
              <span className="product-name">{product.name}</span>
              <div className="product-footer">
                <span className="product-price">
                  {mode === 'WASTE' ? 'Log Item' : mode === 'STAFF_REWARD' ? 'Free Drink' : formatMop(getUnitPrice(product, mode, cupType))}
                </span>
                <div className="temperature-actions" aria-label={`Choose Hot or Iced for ${product.name}`}>
                  {DRINK_TEMPERATURES.map(temperature => (
                    <button className="temperature-button" key={temperature} type="button" disabled={disabled} aria-label={`${TEMPERATURE_LABELS[temperature]} ${product.name}`} onClick={() => onAdd(product, temperature, cupType)}>
                      {TEMPERATURE_LABELS[temperature]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">No active products found. Add products in the Google Sheet, then refresh this page.</div>
      )}
    </section>
  )
}
