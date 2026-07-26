const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
// Base URL of the running AgentOS instance (agent_os.serve(..., port=7790))
const AGENT_OS_URL = import.meta.env.VITE_AGENT_OS_URL || 'http://localhost:7790';
const AGENT_ID = import.meta.env.VITE_AGENT_ID || 'postgres_agent';

// Session ID persisted in localStorage so it survives page reloads.
// Initialize from localStorage or generate a new one.
const SESSION_ID_KEY = 'agent_session_id';
let SESSION_ID = localStorage.getItem(SESSION_ID_KEY);
if (!SESSION_ID) {
  SESSION_ID = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `session-${Date.now()}`;
  localStorage.setItem(SESSION_ID_KEY, SESSION_ID);
}

// Helper to update session ID from agent response
function updateSessionId(newSessionId) {
  if (newSessionId && newSessionId !== SESSION_ID) {
    SESSION_ID = newSessionId;
    localStorage.setItem(SESSION_ID_KEY, SESSION_ID);
  }
}

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
  rejectRun: (runId) =>
  fetch(`${AGENT_OS_URL}/api/approvals/${runId}/reject`, { method: 'POST' }).then(handle),
  getApprovalStatus: (runId) =>
    fetch(`${AGENT_OS_URL}/api/approvals/${runId}`).then(handle),

  continueRun: (runId) =>
    fetch(`${AGENT_OS_URL}/api/approvals/${runId}/continue`, { method: 'POST' }).then(handle),
  
  sendChatMessage: async (message) => {
  const body = new URLSearchParams({ message, session_id: SESSION_ID, user_id: 'demo-user', stream: 'false' });
  const data = await fetch(`${AGENT_OS_URL}/agents/${AGENT_ID}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }).then(handle);

  // Update session_id from agent response if present
  if (data.session_id) {
    updateSessionId(data.session_id);
  }

  if (String(data.status).toUpperCase() === 'PAUSED') {
    return { paused: true, runId: data.run_id };
  }
  return { paused: false, reply: data.content };
},
};