import type React from 'react';
import { beforeEach, expect, test, vi } from 'vite-plus/test';
import { render, screen, userEvent } from '@/test/test-utils';

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span data-testid="account-icon" />,
}));

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      layout,
      variants,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      layout?: boolean | string;
      variants?: unknown;
    }) => (
      <div
        data-layout={layout ? String(layout) : undefined}
        data-variants={variants ? JSON.stringify(variants) : undefined}
        {...props}
      >
        {children}
      </div>
    ),
  },
  useReducedMotion: () => false,
}));

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(async (path: string) => (path.includes('/2fa/status') ? { enabled: false } : [])),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { AccountPanel } from './AccountPanel';

function mockSettingsPanelViewport(isMobile: boolean) {
  vi.mocked(window.matchMedia).mockImplementation((query) => ({
    matches: query === '(max-width: 1023px)' ? isMobile : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  mockSettingsPanelViewport(true);
});

test('account settings inner tabs keep height changes layout-aware', async () => {
  const user = userEvent.setup();

  render(<AccountPanel />);

  expect(screen.getByTestId('account-settings-tab-shell')).toHaveAttribute('data-layout', 'true');
  expect(screen.getByTestId('account-settings-tab-panel')).toHaveAttribute('data-layout', 'true');

  await user.click(screen.getByRole('button', { name: /account.tab.tokens/i }));

  expect(screen.getByTestId('account-settings-tab-panel')).toHaveAttribute('data-layout', 'true');
});

test('account settings inner tab animation is mobile-only', () => {
  mockSettingsPanelViewport(false);

  render(<AccountPanel />);

  expect(screen.getByTestId('account-settings-tab-shell')).not.toHaveAttribute('data-layout');
  expect(screen.getByTestId('account-settings-tab-panel')).not.toHaveAttribute('data-layout');
  expect(screen.getByTestId('account-settings-tab-panel')).not.toHaveAttribute('data-variants');
});

test('account settings inner tab transition does not rise from below', async () => {
  const user = userEvent.setup();

  render(<AccountPanel />);

  expect(screen.getByTestId('account-settings-tab-panel')).not.toHaveAttribute(
    'data-variants',
    expect.stringContaining('"y"')
  );

  await user.click(screen.getByRole('button', { name: /account.tab.tokens/i }));

  expect(screen.getByTestId('account-settings-tab-panel')).not.toHaveAttribute(
    'data-variants',
    expect.stringContaining('"y"')
  );
});
