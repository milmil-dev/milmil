import { useEffect } from 'react';
import useWebSocket from 'react-use-websocket';
import { useScanStore } from '../store/scan-store';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';

export function useMillilWebSocket() {
  const handleScanEvent = useScanStore((s) => s.handleEvent);

  const { lastJsonMessage } = useWebSocket(WS_URL, {
    shouldReconnect: () => true,
    reconnectAttempts: Infinity,
    reconnectInterval: 3000,
    share: true,
  });

  useEffect(() => {
    if (lastJsonMessage && typeof lastJsonMessage === 'object' && 'type' in lastJsonMessage) {
      const event = lastJsonMessage as { type: string; data: Record<string, unknown> };
      // Route scan-related events to the store
      if (event.type.startsWith('scan:') || event.type.startsWith('match:')) {
        handleScanEvent(event);
      }
    }
  }, [lastJsonMessage, handleScanEvent]);

  return lastJsonMessage as { type: string; data: Record<string, unknown> } | null;
}
