import React, { useEffect, useState } from 'react';
import { useApprovalSocket } from './ApprovalSocketContext.jsx';

export default function ApprovalButton({ runId, adapter, onResolved }) {
  const storageKey = `approval_status_${adapter.id}_${runId}`;
  const [status, setStatus] = useState(() => localStorage.getItem(storageKey) || 'unchecked');
  const [busy, setBusy] = useState(false);
  const socket = useApprovalSocket();

  const updateStatus = (newStatus) => {
    setStatus(newStatus);
    localStorage.setItem(storageKey, newStatus);
  };

  // Sync the button's state if the run resolves via Jira Automation instead
  // of a click here (see ApprovalSocketContext).
  useEffect(() => {
    if (!socket) return;
    return socket.subscribe(runId, (msg) => {
      updateStatus(msg.status === 'rejected' ? 'blocked' : 'completed');
    });
  }, [socket, runId]);

  async function handleClick() {
    setBusy(true);
    try {
      if (status !== 'approved') {
        const res = await adapter.getApprovalStatus(runId);
        updateStatus(res.status);

        if (res.status === 'blocked') {
          const rejectRes = await adapter.rejectRun(runId);
          onResolved?.(rejectRes.content || 'Action rejetée - la demande a été bloquée dans Jira.', true);
        }
        return;
      }
      const res = await adapter.continueRun(runId);
      updateStatus('completed');
      onResolved?.(res.content, false);
    } catch (err) {
      onResolved?.(`Erreur : ${err.message}`, true);
    } finally {
      setBusy(false);
    }
  }

  const label = {
    unchecked: 'Vérifier le statut Jira',
    pending: busy ? 'Vérification…' : 'Toujours en attente — revérifier',
    approved: busy ? 'Confirmation…' : 'Approuvé — cliquer pour confirmer',
    blocked: 'Bloqué',
    completed: 'Action exécutée',
  }[status];

  return (
    <button
      className={`approval-button approval-button--${status}`}
      disabled={busy || status === 'blocked' || status === 'completed'}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}
