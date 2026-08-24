import { formatMop } from '@/lib/presentation.mjs'

const MODE_COPY = {
  NORMAL_SALE: { eyebrow: 'Regular Menu', title: 'What Can We Make?', hint: 'Tap an item to add it to the order.' },
  STAFF: { eyebrow: 'Team Menu', title: 'Staff-Price Drinks', hint: 'Staff pricing is applied automatically.' },
  WASTE: { eyebrow: 'Waste Log', title: 'What Was Wasted?', hint: 'Choose an item, quantity, and reason.' },
}

export default function ProductCatalog({ products, mode, onAdd }) {
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
            <button className="product-button" key={product.id} type="button" onClick={() => onAdd(product)}>
              <span className="product-category">{product.category}</span>
              <span className="product-name">{product.name}</span>
              <span className="product-price">
                {mode === 'WASTE' ? 'Log Item' : formatMop(mode === 'STAFF' ? product.staffPrice : product.price)}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state">No active products found. Add products in the Google Sheet, then refresh this page.</div>
      )}
    </section>
  )
}
