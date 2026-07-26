import React, { useState } from 'react';
import { api } from '../api.js';

export default function ApprovalButton({ runId, onResolved }) {
  // 1. Read stored status from localStorage on initial render
  const storageKey = `approval_status_${runId}`;
  const [status, setStatus] = useState(() => {
    return localStorage.getItem(storageKey) || 'unchecked';
  });
  const [busy, setBusy] = useState(false);

  // Helper to update state AND localStorage simultaneously
  const updateStatus = (newStatus) => {
    setStatus(newStatus);
    localStorage.setItem(storageKey, newStatus);
  };

  async function handleClick() {
    setBusy(true);
    try {
      if (status !== 'approved') {
        // First click (or re-check while pending): refresh status
        const res = await api.getApprovalStatus(runId);
        updateStatus(res.status);

        if (res.status === 'blocked') {
          const rejectRes = await api.rejectRun(runId);
          onResolved?.(rejectRes.content || 'Action rejetée - la demande a été bloquée dans Jira.', true);
        }
        return;
      }
      // Confirmed approved on previous click - execute continue
      const res = await api.continueRun(runId);
      updateStatus('completed'); // Mark as completed
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