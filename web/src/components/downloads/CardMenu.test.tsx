// web/src/components/downloads/CardMenu.test.tsx

import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { CardMenu } from './CardMenu';

const baseProps = {
  enabled: true,
  bangumiId: 1 as number | null,
  feedUrl: 'https://example/rss',
  onToggleEnabled: vi.fn(),
  onRefresh: vi.fn(),
  onOpenAnime: vi.fn(),
  onCopyRssUrl: vi.fn(),
  onDelete: vi.fn(),
};

test('button opens the menu on click', async () => {
  const user = userEvent.setup();
  render(<CardMenu {...baseProps} />);
  await user.click(screen.getByRole('button', { name: /more/i }));
  expect(screen.getByRole('menu')).toBeInTheDocument();
});

test('clicking "auto-download" item calls onToggleEnabled', async () => {
  const user = userEvent.setup();
  render(<CardMenu {...baseProps} />);
  await user.click(screen.getByRole('button', { name: /more/i }));
  await user.click(screen.getByText(/自動下載|auto.?download/i));
  expect(baseProps.onToggleEnabled).toHaveBeenCalled();
});

test('clicking "refresh" item calls onRefresh', async () => {
  const user = userEvent.setup();
  render(<CardMenu {...baseProps} />);
  await user.click(screen.getByRole('button', { name: /more/i }));
  await user.click(screen.getByText(/refresh|刷新/i));
  expect(baseProps.onRefresh).toHaveBeenCalled();
});

test('clicking "delete" item calls onDelete', async () => {
  const user = userEvent.setup();
  render(<CardMenu {...baseProps} />);
  await user.click(screen.getByRole('button', { name: /more/i }));
  await user.click(screen.getByText(/刪除|delete/i));
  expect(baseProps.onDelete).toHaveBeenCalled();
});

test('"open in anime page" item disabled when bangumiId is null', async () => {
  const user = userEvent.setup();
  render(<CardMenu {...baseProps} bangumiId={null} />);
  await user.click(screen.getByRole('button', { name: /more/i }));
  const item = screen.getByText(/openAnime|anime 頁面|anime page/i).closest('[role="menuitem"]');
  expect(item).toHaveAttribute('aria-disabled', 'true');
});
