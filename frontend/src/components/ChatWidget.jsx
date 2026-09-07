import React, { useEffect, useRef, useState } from 'react';
import ApprovalButton from './ApprovalButton.jsx';
import { ApprovalSocketProvider } from './ApprovalSocketContext.jsx';
import AgentSelector from './AgentSelector.jsx';
import { AGENTS, AGENT_LIST, DEFAULT_AGENT_ID } from '../agents/index.js';

const WELCOME = {
  role: 'assistant',
  text: "Hi, I'm connected to the inventory database. Ask me things like \"which products are low on stock?\" or \"restock the Cirrus headphones to 50 units\".",
};

export default function ChatWidget({ onDataChanged }) {
  const [agentId, setAgentId] = useState(DEFAULT_AGENT_ID);
  const adapter = AGENTS[agentId];

  const [sessionId, setSessionId] = useState(() => adapter.getSessionId());
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const unsub = adapter.onSessionIdChange(setSessionId);
    const id = adapter.getSessionId();
    setSessionId(id);
    adapter
      .getSessionHistory(id)
      .then((h) => setMessages(h.length ? h : [WELCOME]))
      .catch(() => setMessages([WELCOME]));
    return unsub;
  }, [agentId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  function loadSessionList() {
    adapter.listSessions().then(setSessions).catch(() => setSessions([]));
  }

  useEffect(() => {
    if (open) loadSessionList();
  }, [open, agentId]);

  async function handleSelectSession(id) {
    if (id === sessionId) return;
    try {
      const history = await adapter.getSessionHistory(id);
      adapter.switchSession(id);
      setMessages(history.length ? history : [WELCOME]);
    } catch (err) {
      console.error('Failed to load session history', err);
    }
  }

  function handleNewChat() {
    adapter.startNewSession();
    setMessages([WELCOME]);
  }

  function handleAgentMessage(text, isError) {
    setMessages((m) => [...m, { role: 'assistant', text, isError }]);
    onDataChanged?.();
  }

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setSending(true);

    try {
      const res = await adapter.sendMessage(text);
      if (res.paused) {
        setMessages((m) => [
          ...m,
          { role: 'assistant', text: 'Action en attente de validation…', pausedRunId: res.runId },
        ]);
      } else {
        setMessages((m) => [...m, { role: 'assistant', text: res.reply }]);
        onDataChanged?.();
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: `Sorry, I couldn't reach the agent service (${err.message}). Is it running on the configured port?`,
          isError: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <ApprovalSocketProvider wsBaseUrl={adapter.wsBaseUrl} sessionId={sessionId} onResolved={handleAgentMessage}>
      <div className="chat-widget">
        {open && (
          <div className="chat-panel">
            <div className="chat-panel__sidebar" style={{ display: showSessions ? 'flex' : 'none' }}>
              <div className="chat-panel__sidebar-header">
                <span>Conversations</span>
                <button className="session-item--new" onClick={handleNewChat}>
                  + New
                </button>
              </div>
              <div className="chat-panel__sidebar-list">
                {sessions.map((s) => (
                  <button
                    key={s.session_id}
                    className={`session-item ${s.session_id === sessionId ? 'session-item--active' : ''}`}
                    onClick={() => handleSelectSession(s.session_id)}
                  >
                    <span className="session-item__title">
                      {s.session_name || 'Nouvelle conversation'}
                    </span>
                    <span className="session-item__date">
                      {new Date(s.created_at).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="chat-panel__main">
              <div className="chat-panel__header">
                <div>
                  <span className="chat-panel__title">Inventory Agent</span>
                  <AgentSelector agents={AGENT_LIST} selectedId={agentId} onSelect={setAgentId} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className={`icon-button ${showSessions ? 'icon-button--active' : ''}`}
                    onClick={() => setShowSessions((s) => !s)}
                    title="Conversations"
                  >
                    🕑
                  </button>
                  <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close chat">
                    ×
                  </button>
                </div>
              </div>

              <div className="chat-panel__messages" ref={scrollRef}>
                {messages.map((m, i) => (
                  <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
                    {m.text}
                    {m.pausedRunId && (
                      <ApprovalButton
                        adapter={adapter}
                        runId={m.pausedRunId}
                        onResolved={(text, isError) => {
                          setMessages((cur) => [...cur, { role: 'assistant', text, isError }]);
                          onDataChanged?.();
                        }}
                      />
                    )}
                  </div>
                ))}
                {sending && <div className="chat-bubble chat-bubble--assistant chat-bubble--typing">…</div>}
              </div>

              <form className="chat-panel__input" onSubmit={handleSend}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about the catalog…"
                  disabled={sending}
                />
                <button type="submit" disabled={sending || !input.trim()}>
                  Send
                </button>
              </form>
            </div>
          </div>
        )}

        <button className="chat-fab" onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'Ask the agent'}
        </button>
      </div>
    </ApprovalSocketProvider>
  );
}
