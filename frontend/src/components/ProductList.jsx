import React, { useMemo, useState } from 'react';
import logo from '../assets/Capgemini_Primary-logo_Capgemini-Blue.png';

const STATUS_LABEL = {
  active: 'In stock',
  low_stock: 'Low stock',
  discontinued: 'Discontinued',
};

export default function ProductList({ products, selectedId, onSelect, loading, error }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
    );
  }, [products, query]);

  return (
    <aside className="product-list">
      <div className="product-list__header">
        <img className="product-list__logo" src={logo} alt="Capgemini logo" />
        <span className="eyebrow">Catalog</span>
        <h1>Inventory Console</h1>
        <input
          className="search-input"
          placeholder="Search by name, SKU, category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="product-list__body">
        {loading && <p className="hint">Loading products…</p>}
        {error && <p className="hint hint--error">{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="hint">No products match "{query}".</p>
        )}
        <ul>
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                className={`product-row ${selectedId === p.id ? 'product-row--active' : ''}`}
                onClick={() => onSelect(p.id)}
              >
                <div className="product-row__main">
                  <span className="product-row__name">{p.name}</span>
                  <span className="product-row__sku">{p.sku}</span>
                </div>
                <div className="product-row__meta">
                  <span className="product-row__price">${Number(p.price).toFixed(2)}</span>
                  <span className={`status-dot status-dot--${p.status}`} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export { STATUS_LABEL };
