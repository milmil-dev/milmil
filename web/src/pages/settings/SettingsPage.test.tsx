import type React from 'react';
import { beforeEach, expect, test, vi } from 'vite-plus/test';
import { render, screen, userEvent, within } from '@/test/test-utils';

const navigateMock = vi.fn();
const scrollToMock = vi.fn();
const logoutMock = vi.fn();
const authUserMock = { id: 'user-1', username: 'admin' };
let searchState: { tab?: string } = {};

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchState,
}));

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span data-testid="settings-icon" />,
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
    button: ({
      children,
      variants: _variants,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      variants?: unknown;
    }) => <button {...props}>{children}</button>,
  },
  useReducedMotion: () => false,
}));

vi.mock('@/components/PageAtmosphere', () => ({
  PageAtmosphere: () => null,
}));

vi.mock('@/components/PageTransition', () => ({
  PageTransition: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => (
    <div data-disabled={disabled ? 'true' : 'false'} data-testid="settings-page-transition">
      {children}
    </div>
  ),
}));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (
    selector: (state: { logout: typeof logoutMock; user: typeof authUserMock }) => unknown
  ) => selector({ logout: logoutMock, user: authUserMock }),
}));

vi.mock('./GeneralPanel', () => ({ GeneralPanel: () => <div>General panel</div> }));
vi.mock('./IntegrationsPanel', () => ({
  IntegrationsPanel: () => <div>Integrations panel</div>,
}));
vi.mock('./NotificationSettingsPanel', () => ({
  NotificationSettingsPanel: () => <div>Notifications panel</div>,
}));
vi.mock('./DownloadPanel', () => ({ DownloadPanel: () => <div>Download panel</div> }));
vi.mock('./PlayerPanel', () => ({ PlayerPanel: () => <div>Player panel</div> }));
vi.mock('./AccountPanel', () => ({ AccountPanel: () => <div>Account panel</div> }));
vi.mock('./BackupPanel', () => ({ BackupPanel: () => <div>Backup panel</div> }));
vi.mock('./StoragePanel', () => ({ StoragePanel: () => <div>Storage panel</div> }));
vi.mock('./AboutPanel', () => ({ AboutPanel: () => <div>About panel</div> }));

import { SettingsPage } from './SettingsPage';

beforeEach(() => {
  navigateMock.mockClear();
  scrollToMock.mockClear();
  logoutMock.mockClear();
  searchState = {};
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    value: scrollToMock,
    writable: true,
  });
  vi.mocked(window.matchMedia).mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

test('mobile settings starts with a category list when no tab is selected', () => {
  render(<SettingsPage />);

  const mobileList = screen.getByTestId('mobile-settings-list');
  expect(mobileList).toBeInTheDocument();
  expect(
    within(mobileList).getByRole('button', { name: /settings.nav.general/i })
  ).toBeInTheDocument();
});

test('mobile settings root exposes logout action', async () => {
  const user = userEvent.setup();
  render(<SettingsPage />);

  const mobileList = screen.getByTestId('mobile-settings-list');
  const logoutButton = within(mobileList).getByRole('button', { name: /account.logout/i });

  expect(logoutButton).toBeInTheDocument();

  await user.click(logoutButton);

  expect(logoutMock).toHaveBeenCalledTimes(1);
  expect(navigateMock).toHaveBeenCalledWith({ to: '/login', replace: true });
});

test('mobile settings root shows the signed-in user avatar header', async () => {
  const user = userEvent.setup();
  render(<SettingsPage />);

  const mobileList = screen.getByTestId('mobile-settings-list');
  const accountHeader = within(mobileList).getByRole('button', { name: /admin/i });

  expect(accountHeader).toHaveTextContent('A');
  expect(accountHeader).toHaveTextContent('admin');
  expect(accountHeader).toHaveTextContent('ID: user-1');

  await user.click(accountHeader);

  expect(scrollToMock).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  expect(navigateMock).toHaveBeenCalledWith({
    to: '/settings',
    search: { tab: 'account' },
    replace: true,
  });
});

test('mobile settings detail has a back button when a tab is selected', () => {
  searchState = { tab: 'player' };

  render(<SettingsPage />);

  expect(screen.getByTestId('mobile-settings-detail')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /back to settings/i })).toBeInTheDocument();
  expect(screen.getByText('Player panel')).toBeInTheDocument();
});

test('mobile settings detail shows the selected tab title in the top bar', () => {
  searchState = { tab: 'general' };

  render(<SettingsPage />);

  const detail = screen.getByTestId('mobile-settings-detail');
  expect(within(detail).getByRole('heading', { level: 1 })).toHaveTextContent(
    'settings.nav.general'
  );
});

test('mobile settings list and detail expose motion variants', () => {
  const { unmount } = render(<SettingsPage />);

  expect(screen.getByTestId('mobile-settings-list')).toHaveAttribute('initial', 'hidden');
  expect(screen.getByTestId('mobile-settings-list')).toHaveAttribute('animate', 'show');

  unmount();
  searchState = { tab: 'general' };
  render(<SettingsPage />);

  expect(screen.getByTestId('mobile-settings-detail')).toHaveAttribute('initial', 'hidden');
  expect(screen.getByTestId('mobile-settings-detail')).toHaveAttribute('animate', 'show');
});

test('mobile settings master-to-detail avoids height layout reveal', () => {
  searchState = { tab: 'account' };

  render(<SettingsPage />);

  expect(screen.getByTestId('mobile-settings-detail')).not.toHaveAttribute('data-layout');
  expect(screen.getByTestId('mobile-settings-detail-motion')).not.toHaveAttribute('data-layout');
});

test('mobile settings detail transition does not rise from below', () => {
  searchState = { tab: 'account' };

  render(<SettingsPage />);

  expect(screen.getByTestId('mobile-settings-detail')).not.toHaveAttribute(
    'data-variants',
    expect.stringContaining('"y"')
  );
});

test('mobile settings opens detail from the top of the page', async () => {
  const user = userEvent.setup();
  render(<SettingsPage />);

  await user.click(
    within(screen.getByTestId('mobile-settings-list')).getByRole('button', {
      name: /settings.nav.general/i,
    })
  );

  expect(scrollToMock).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  expect(navigateMock).toHaveBeenCalledWith({
    to: '/settings',
    search: { tab: 'general' },
    replace: true,
  });
});

test('mobile settings detail pushes in from the right without vertical movement', () => {
  searchState = { tab: 'general' };

  render(<SettingsPage />);

  const variants = screen.getByTestId('mobile-settings-detail').getAttribute('data-variants');
  expect(variants).toContain('"x"');
  expect(variants).not.toContain('"y"');
});

test('mobile settings list transition does not rise from below', () => {
  render(<SettingsPage />);

  expect(screen.getByTestId('mobile-settings-list')).not.toHaveAttribute(
    'data-variants',
    expect.stringContaining('"y"')
  );
});

test('settings keeps page transition enabled for desktop layout', () => {
  vi.mocked(window.matchMedia).mockImplementation((query) => ({
    matches: query === '(min-width: 1024px)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  searchState = { tab: 'account' };

  render(<SettingsPage />);

  expect(screen.getByTestId('settings-page-transition')).toHaveAttribute('data-disabled', 'false');
  expect(screen.queryByTestId('mobile-settings-detail')).not.toBeInTheDocument();
  expect(screen.getByTestId('desktop-settings-detail-motion')).toBeInTheDocument();
});

test('settings disables page transition for mobile layout to avoid vertical flash', () => {
  searchState = { tab: 'account' };

  render(<SettingsPage />);

  expect(screen.getByTestId('settings-page-transition')).toHaveAttribute('data-disabled', 'true');
});
