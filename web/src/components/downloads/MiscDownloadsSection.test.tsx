// web/src/components/downloads/MiscDownloadsSection.test.tsx
import { expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { MiscDownloadsSection } from './MiscDownloadsSection';

test('renders count badge and toggles open/close', async () => {
  const user = userEvent.setup();
  const downloads = [
    { id: 'd', gid: 'g', name: '[manual] foo', status: 'active',
      total_bytes: 100, completed_bytes: 50, speed_bytes: 10, created_at: '', rule_id: null },
  ] as never;
  render(<MiscDownloadsSection downloads={downloads} mode="active" onDelete={() => {}} />);
  // Header visible with count
  expect(screen.getByRole('button', { name: /1/ })).toBeInTheDocument();
  // Rows hidden by default
  expect(screen.queryByText('[manual] foo')).toBeNull();
  // Toggle open
  await user.click(screen.getByRole('button', { name: /1/ }));
  expect(screen.getByText('[manual] foo')).toBeInTheDocument();
});

test('returns null when no downloads', () => {
  const { container } = render(<MiscDownloadsSection downloads={[]} mode="active" onDelete={() => {}} />);
  expect(container.firstChild).toBeNull();
});
