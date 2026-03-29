import { useEffect, useRef } from 'react';
import { useScanStore } from '../store/scan-store';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';

interface WSEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Connects to the milmil WebSocket with auto-reconnect.
 * Routes scan/match events to the Zustand scan store.
 * Returns the latest event for consumers.
 */
export function useMillilWebSocket() {
  const lastEventRef = useRef<WSEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data) as WSEvent;
          lastEventRef.current = event;

          // Route scan-related events to the store
          if (event.type?.startsWith('scan:') || event.type?.startsWith('match:')) {
            useScanStore.getState().handleEvent(event);
          }

          // Dispatch custom event so root layout can listen
          window.dispatchEvent(new CustomEvent('milmil-ws', { detail: event }));
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (mountedRef.current) {
          // Reconnect after 3 seconds
          reconnectTimer.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  return lastEventRef;
}

/**
 * Hook to listen for specific milmil WebSocket events.
 * Uses the custom event dispatched by useMillilWebSocket.
 */
export function useWSEvent(handler: (event: WSEvent) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    function listener(e: Event) {
      handlerRef.current((e as CustomEvent).detail);
    }
    window.addEventListener('milmil-ws', listener);
    return () => window.removeEventListener('milmil-ws', listener);
  }, []);
}
