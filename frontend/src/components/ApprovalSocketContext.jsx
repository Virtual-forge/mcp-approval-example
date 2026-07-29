// ApprovalSocketContext.jsx
import React, { createContext, useContext, useEffect, useRef } from 'react';

const ApprovalSocketContext = createContext(null);

export function ApprovalSocketProvider({ sessionId, onResolved, children }) {
  const listenersRef = useRef(new Map()); // runId -> Set<callback>

  useEffect(() => {
    if (!sessionId) return;
    const ws = new WebSocket(`ws://localhost:7790/ws/sessions/${sessionId}`);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type !== 'run_resumed') return;

      // Notify the chat window
      onResolved?.(msg.content, msg.status === 'rejected');

      // Notify any subscribed button for that runId
      listenersRef.current.get(msg.run_id)?.forEach((cb) => cb(msg));
    };

    return () => ws.close();
  }, [sessionId, onResolved]);

  const subscribe = (runId, cb) => {
    if (!listenersRef.current.has(runId)) listenersRef.current.set(runId, new Set());
    listenersRef.current.get(runId).add(cb);
    return () => listenersRef.current.get(runId)?.delete(cb);
  };

  return (
    <ApprovalSocketContext.Provider value={{ subscribe }}>
      {children}
    </ApprovalSocketContext.Provider>
  );
}

export const useApprovalSocket = () => useContext(ApprovalSocketContext);