import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import ApprovalButton from './ApprovalButton.jsx';
const WELCOME = {
  role: 'assistant',
  text: "Hi, I'm connected to the inventory database. Ask me things like \"which products are low on stock?\" or \"restock the Cirrus headphones to 50 units\".",
};

export default function ChatWidget({ onDataChanged }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setSending(true);

    try {
      const res = await api.sendChatMessage(text);
      if (res.paused) {
        setMessages((m) => [...m, { role: 'assistant', text: 'Action en attente de validation…', pausedRunId: res.runId }]);
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
    <div className="chat-widget">
      {open && (
        <div className="chat-panel">
          <div className="chat-panel__header">
            <div>
              <span className="chat-panel__title">Inventory Agent</span>
              <span className="chat-panel__subtitle">Agno · Postgres MCP</span>
            </div>
            <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close chat">
              ×
            </button>
          </div>

          <div className="chat-panel__messages" ref={scrollRef}>
          {messages.map((m, i) => (
            <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
              {m.text}
              {m.pausedRunId && (
              <ApprovalButton
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
      )}

      <button className="chat-fab" onClick={() => setOpen((o) => !o)}>
        {open ? 'Close' : 'Ask the agent'}
      </button>
    </div>
  );
}
