const AGENT_OS_URL = import.meta.env.VITE_AGENT_OS_URL || 'http://localhost:7790';
const AGENT_ID = import.meta.env.VITE_AGENT_ID || 'postgres_agent';
const SESSION_ID_KEY = 'agent_session_id_agno';

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

export const agnoAdapter = {
  id: 'agno',
  label: 'Postgres (Agno)',
  iconId: 'agno',
  wsBaseUrl: AGENT_OS_URL.replace(/^http/, 'ws'),

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
    const body = new URLSearchParams({
      message: text,
      session_id: SESSION_ID,
      user_id: 'demo-user',
      stream: 'false',
    });
    const data = await fetch(`${AGENT_OS_URL}/agents/${AGENT_ID}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }).then(handle);

    // AgentOS may assign/rename the session server-side - stay in sync.
    if (data.session_id && data.session_id !== SESSION_ID) setSessionId(data.session_id);

    if (String(data.status).toUpperCase() === 'PAUSED') {
      return { paused: true, runId: data.run_id };
    }
    return { paused: false, reply: data.content };
  },

  listSessions: () =>
    fetch(`${AGENT_OS_URL}/sessions?type=agent&component_id=${AGENT_ID}&user_id=demo-user&limit=50`)
      .then(handle)
      .then((res) =>
        res.data.map((s) => ({
          session_id: s.session_id,
          session_name: s.session_name,
          created_at: s.created_at,
          updated_at: s.updated_at,
        }))
      ),

  getSessionHistory: (sessionId) =>
    fetch(`${AGENT_OS_URL}/sessions/${sessionId}?type=agent`)
      .then(handle)
      .then((detail) =>
        (detail.chat_history || [])
          .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
          .map((m) => ({ role: m.role, text: m.content }))
      ),

  getApprovalStatus: (runId) => fetch(`${AGENT_OS_URL}/api/approvals/${runId}`).then(handle),
  continueRun: (runId) => fetch(`${AGENT_OS_URL}/api/approvals/${runId}/continue`, { method: 'POST' }).then(handle),
  rejectRun: (runId) => fetch(`${AGENT_OS_URL}/api/approvals/${runId}/reject`, { method: 'POST' }).then(handle),
};
