import React from 'react';
import { STATUS_LABEL } from './ProductList.jsx';

export default function ProductDetail({ product, loading, error }) {
  if (loading) return <main className="product-detail"><p className="hint">Loading…</p></main>;
  if (error) return <main className="product-detail"><p className="hint hint--error">{error}</p></main>;
  if (!product) {
    return (
      <main className="product-detail product-detail--empty">
        <p className="hint">Select a product from the catalog to see its details.</p>
      </main>
    );
  }

  return (
    <main className="product-detail">
      <div className="product-detail__header">
        <span className="eyebrow">{product.category}</span>
        <h2>{product.name}</h2>
        <span className={`badge badge--${product.status}`}>
          {STATUS_LABEL[product.status] || product.status}
        </span>
      </div>

      <p className="product-detail__description">{product.description}</p>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-card__label">Price</span>
          <span className="stat-card__value">${Number(product.price).toFixed(2)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Stock on hand</span>
          <span className="stat-card__value">{product.stock}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">SKU</span>
          <span className="stat-card__value stat-card__value--mono">{product.sku}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Last updated</span>
          <span className="stat-card__value">
            {new Date(product.updated_at).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
      </div>
    </main>
  );
}
