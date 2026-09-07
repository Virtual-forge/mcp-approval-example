import React, { createContext, useContext, useEffect, useRef } from 'react';

const ApprovalSocketContext = createContext(null);

export function ApprovalSocketProvider({ sessionId, wsBaseUrl, onResolved, children }) {
  const listenersRef = useRef(new Map()); // runId -> Set<callback>
  const onResolvedRef = useRef(onResolved);
  useEffect(() => {
    onResolvedRef.current = onResolved;
  }, [onResolved]);

  useEffect(() => {
    if (!sessionId || !wsBaseUrl) return;
    const ws = new WebSocket(`${wsBaseUrl}/ws/sessions/${sessionId}`);
    let closedEarly = false;

    ws.onopen = () => {
      if (closedEarly) ws.close();
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type !== 'run_resumed') return;

      onResolvedRef.current?.(msg.content, msg.status === 'rejected');

      // Agno's payload uses run_id, LangGraph's uses approval_id - accept either.
      const id = msg.run_id || msg.approval_id;
      listenersRef.current.get(id)?.forEach((cb) => cb(msg));
    };

    return () => {
      closedEarly = true;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      } else {
        ws.addEventListener('open', () => ws.close(), { once: true });
      }
    };
  }, [sessionId, wsBaseUrl]);

  const subscribe = (runId, cb) => {
    if (!listenersRef.current.has(runId)) listenersRef.current.set(runId, new Set());
    listenersRef.current.get(runId).add(cb);
    return () => listenersRef.current.get(runId)?.delete(cb);
  };

  return (
    <ApprovalSocketContext.Provider value={{ subscribe }}>{children}</ApprovalSocketContext.Provider>
  );
}

export const useApprovalSocket = () => useContext(ApprovalSocketContext);
