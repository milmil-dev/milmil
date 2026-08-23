import { useEffect, useRef } from 'react';
import { api } from '../lib/api-client';
import { useScanStore } from '../store/scan-store';

const API_URL = import.meta.env.VITE_API_URL ?? '';
// Empty API_URL means same-origin (production behind a reverse proxy that
// proxies /ws) — derive scheme/host from window.location. Otherwise (dev
// with API on a different origin), swap http→ws on the configured URL.
const WS_URL = API_URL
  ? API_URL.replace(/^http/, 'ws') + '/ws'
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

interface WSEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Opens an authenticated WebSocket.
 *
 * A handshake cannot carry an Authorization header, so we exchange the stored
 * API token for a single-use ticket first. The ticket is redeemed by the
 * server on upgrade and expires within a minute, so it is safe for it to
 * appear in the URL where the long-lived token would not be.
 */
export async function connectAuthenticatedWebSocket(): Promise<WebSocket> {
  const { ticket } = await api.get<{ ticket: string; expires_in: number }>('/api/v1/ws/ticket');
  return new WebSocket(`${WS_URL}?ticket=${encodeURIComponent(ticket)}`);
}

const RECONNECT_DELAY_MS = 3000;

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

    function scheduleReconnect() {
      if (!mountedRef.current) return;
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
    }

    async function connect() {
      if (!mountedRef.current) return;

      let ws: WebSocket;
      try {
        ws = await connectAuthenticatedWebSocket();
      } catch {
        // No valid session yet (or the ticket call failed) — back off and
        // retry rather than spinning on a rejected handshake.
        scheduleReconnect();
        return;
      }

      // The await above yields, so the component may have unmounted meanwhile.
      if (!mountedRef.current) {
        ws.close();
        return;
      }
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
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    void connect();

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
