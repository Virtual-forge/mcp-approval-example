const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_URL || 'http://localhost:7791';
const SESSION_ID_KEY = 'agent_session_id_langgraph';

let SESSION_ID = localStorage.getItem(SESSION_ID_KEY);
if (!SESSION_ID) {
  SESSION_ID = crypto.randomUUID();
  localStorage.setItem(SESSION_ID_KEY, SESSION_ID);
}

const listeners = new Set();
function notify() {
  listeners.forEach((cb) => cb(SESSION_ID));
}
function setSessionId(id) {
  SESSION_ID = id;
  localStorage.setItem(SESSION_ID_KEY, SESSION_ID);
  notify();
}

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.detail || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const langgraphAdapter = {
  id: 'langgraph',
  label: 'Postgres (LangGraph)',
  iconId: 'langgraph',
  wsBaseUrl: LANGGRAPH_URL.replace(/^http/, 'ws'),

  getSessionId: () => SESSION_ID,
  onSessionIdChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  switchSession: (id) => setSessionId(id),
  startNewSession() {
    setSessionId(crypto.randomUUID());
    return SESSION_ID;
  },

  async sendMessage(text) {
    const data = await fetch(`${LANGGRAPH_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, thread_id: SESSION_ID, user_id: 'demo-user' }),
    }).then(handle);

    if (data.paused) return { paused: true, runId: data.approval_id };
    return { paused: false, reply: data.content };
  },

  listSessions: () =>
    fetch(`${LANGGRAPH_URL}/sessions?user_id=demo-user`).then(handle).then((res) => res.data),

  getSessionHistory: (sessionId) =>
    fetch(`${LANGGRAPH_URL}/sessions/${sessionId}`)
      .then(handle)
      .then((detail) => (detail.chat_history || []).map((m) => ({ role: m.role, text: m.content }))),

  getApprovalStatus: (runId) => fetch(`${LANGGRAPH_URL}/api/approvals/${runId}`).then(handle),
  continueRun: (runId) => fetch(`${LANGGRAPH_URL}/api/approvals/${runId}/continue`, { method: 'POST' }).then(handle),
  rejectRun: (runId) => fetch(`${LANGGRAPH_URL}/api/approvals/${runId}/reject`, { method: 'POST' }).then(handle),
};
