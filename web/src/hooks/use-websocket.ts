import { useEffect, useRef } from 'react';

interface WSEvent {
  type: string;
  data: any;
}

type EventHandler = (event: WSEvent) => void;

export function useWebSocket(onEvent?: EventHandler) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';
    const wsUrl = apiUrl.replace(/^http/, 'ws') + '/ws';

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const event: WSEvent = JSON.parse(e.data);
        onEvent?.(event);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      // Reconnect after 3 seconds
      setTimeout(() => {
        wsRef.current = null;
      }, 3000);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []); // eslint-disable-line

  return wsRef;
}
