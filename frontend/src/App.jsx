import React, { useCallback, useEffect, useState } from 'react';
import ProductList from './components/ProductList.jsx';
import ProductDetail from './components/ProductDetail.jsx';
import ChatWidget from './components/ChatWidget.jsx';
import { api } from './api.js';
import { ApprovalSocketProvider } from './components/ApprovalSocketContext.jsx';
export default function App() {
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState(null);
  const [detailError, setDetailError] = useState(null);

  const loadProducts = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const data = await api.listProducts();
      setProducts(data);
      setSelectedId((current) => current ?? data[0]?.id ?? null);
    } catch (err) {
      setListError(`Couldn't load products (${err.message}).`);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (selectedId == null) return;
    setDetailLoading(true);
    setDetailError(null);
    api
      .getProduct(selectedId)
      .then(setSelectedProduct)
      .catch((err) => setDetailError(`Couldn't load this product (${err.message}).`))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  // Called after the chat agent runs, in case it changed data via MCP.
  const refreshAll = useCallback(() => {
    loadProducts();
    if (selectedId != null) {
      api.getProduct(selectedId).then(setSelectedProduct).catch(() => {});
    }
  }, [loadProducts, selectedId]);

  return (
    <div className="app-shell">
      <ProductList
        products={products}
        selectedId={selectedId}
        onSelect={setSelectedId}
        loading={listLoading}
        error={listError}
      />
      <ProductDetail product={selectedProduct} loading={detailLoading} error={detailError} />
      <ApprovalSocketProvider sessionId={sessionId} onResolved={handleAgentMessage}>
       <ChatWindow />
      </ApprovalSocketProvider>
    </div>
  );
}
