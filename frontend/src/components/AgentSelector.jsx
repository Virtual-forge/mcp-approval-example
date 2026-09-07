import React, { useEffect, useRef, useState } from 'react';
import { AGENT_ICONS } from './AgentIcons.jsx';

export default function AgentSelector({ agents, selectedId, onSelect }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const selected = agents.find((a) => a.id === selectedId) || agents[0];
  const SelectedIcon = AGENT_ICONS[selected.iconId];

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="agent-selector" ref={rootRef}>
      <button
        type="button"
        className="agent-selector__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <SelectedIcon size={14} />
        <span>{selected.label}</span>
        <span className="agent-selector__chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <ul className="agent-selector__menu" role="listbox">
          {agents.map((a) => {
            const Icon = AGENT_ICONS[a.iconId];
            return (
              <li key={a.id}>
                <button
                  type="button"
                  className={`agent-selector__option ${a.id === selectedId ? 'agent-selector__option--active' : ''}`}
                  onClick={() => {
                    onSelect(a.id);
                    setOpen(false);
                  }}
                  role="option"
                  aria-selected={a.id === selectedId}
                >
                  <Icon size={14} />
                  <span>{a.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
