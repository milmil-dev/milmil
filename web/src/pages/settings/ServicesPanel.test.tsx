import { beforeEach, expect, test, vi } from 'vite-plus/test';
import { render, screen, userEvent, waitFor } from '@/test/test-utils';

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span data-testid="icon" />,
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="qr" data-value={value} />,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const { patch, post, del } = vi.hoisted(() => ({
  patch: vi.fn(async (_path: string, body: unknown) => ({ ...(body as object) })),
  post: vi.fn(async () => ({ started: true })),
  del: vi.fn(async () => undefined),
}));

vi.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      message: string
    ) {
      super(message);
    }
  },
  api: {
    get: vi.fn(async (path: string) => {
      if (path.endsWith('/services/jellyfin/devices')) {
        return {
          devices: [
            {
              device_id: 'atv-1',
              client: 'Infuse',
              device_name: 'Living Room',
              first_seen: new Date().toISOString(),
              last_seen: new Date().toISOString(),
              revoked: false,
            },
          ],
        };
      }
      return {
        system: { version: '0.1.17', uptime_seconds: 90_000, started_at: new Date().toISOString() },
        services: [
          {
            id: 'jellyfin',
            kind: 'api',
            name: 'Jellyfin API',
            enabled: true,
            controllable: true,
            runnable: false,
            running: false,
            interval_seconds: null,
            last_run_at: null,
            last_duration_ms: null,
            last_error: '',
            next_run_at: null,
            summary: '1 device',
            extra: {
              address: 'http://192.168.1.2:18080/jellyfin',
              discovery_enabled: true,
              discovery_port: 7359,
              device_count: 1,
            },
          },
          {
            id: 'worker.rss_refresh',
            kind: 'worker',
            name: 'rss_refresh',
            enabled: true,
            controllable: true,
            runnable: true,
            running: false,
            interval_seconds: 300,
            last_run_at: new Date(Date.now() - 120_000).toISOString(),
            last_duration_ms: 1200,
            last_error: '',
            next_run_at: null,
            summary: '2 feeds',
            extra: null,
          },
          {
            id: 'worker.library_reconcile',
            kind: 'worker',
            name: 'library_reconcile',
            enabled: true,
            controllable: true,
            runnable: true,
            running: false,
            interval_seconds: 3600,
            last_run_at: new Date(Date.now() - 600_000).toISOString(),
            last_duration_ms: 4000,
            last_error: 'scan failed: permission denied',
            next_run_at: null,
            summary: '',
            extra: null,
          },
          {
            id: 'transcode_cache',
            kind: 'daemon',
            name: 'transcode cache',
            enabled: true,
            controllable: false,
            runnable: false,
            running: false,
            interval_seconds: null,
            last_run_at: null,
            last_duration_ms: null,
            last_error: '',
            next_run_at: null,
            summary: '',
            extra: { bytes: 1_900_000_000 },
          },
        ],
      };
    }),
    post,
    put: vi.fn(),
    patch,
    delete: del,
  },
}));

import { ServicesPanel } from './ServicesPanel';

beforeEach(() => {
  patch.mockClear();
  post.mockClear();
  del.mockClear();
});

test('renders services, puts failing workers first, and shows the Jellyfin address', async () => {
  render(<ServicesPanel />);

  expect(await screen.findByTestId('jellyfin-address')).toHaveTextContent(
    'http://192.168.1.2:18080/jellyfin'
  );
  const workers = screen.getByTestId('services-workers');
  const rows = workers.querySelectorAll('[data-testid^="service-worker."]');
  const first = rows[0];
  if (!first) throw new Error('no worker rows rendered');
  expect(first).toHaveAttribute('data-testid', 'service-worker.library_reconcile');
  expect(first).toHaveTextContent('scan failed: permission denied');
  expect(first.querySelector('[data-health="error"]')).not.toBeNull();
  expect(await screen.findByTestId('jellyfin-devices')).toHaveTextContent('Infuse');
});

test('run now posts to the run endpoint and toggles patch the service', async () => {
  const user = userEvent.setup();
  render(<ServicesPanel />);
  await screen.findByTestId('service-worker.rss_refresh');

  await user.click(
    screen.getByRole('button', {
      name: /services\.row\.runNow: services\.name\.worker\.rss_refresh/i,
    })
  );
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/v1/system/services/worker.rss_refresh/run')
  );

  await user.click(screen.getByRole('switch', { name: /services\.name\.worker\.rss_refresh/i }));
  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith('/api/v1/system/services/worker.rss_refresh', {
      enabled: false,
    })
  );
});

test('revoking a Jellyfin device calls DELETE', async () => {
  const user = userEvent.setup();
  render(<ServicesPanel />);
  await screen.findByTestId('jellyfin-devices');
  await user.click(screen.getByRole('button', { name: /services\.jellyfin\.revoke/i }));
  await waitFor(() =>
    expect(del).toHaveBeenCalledWith('/api/v1/system/services/jellyfin/devices/atv-1')
  );
});
