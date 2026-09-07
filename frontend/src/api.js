const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.detail || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listProducts: () => fetch(`${API_URL}/products`).then(handle),
  getProduct: (id) => fetch(`${API_URL}/products/${id}`).then(handle),
};
