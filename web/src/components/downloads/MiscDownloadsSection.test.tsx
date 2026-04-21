// web/src/components/downloads/MiscDownloadsSection.test.tsx

import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { MiscDownloadsSection } from './MiscDownloadsSection';

test('renders header with total count and toggles open', async () => {
  const user = userEvent.setup();
  const downloads = [
    {
      id: 'a',
      gid: 'a',
      name: '[manual] foo',
      status: 'active',
      total_bytes: 100,
      completed_bytes: 50,
      speed_bytes: 10,
      created_at: '',
      rule_id: null,
    },
    {
      id: 'b',
      gid: 'b',
      name: '[manual] bar',
      status: 'complete',
      total_bytes: 200,
      completed_bytes: 200,
      speed_bytes: 0,
      created_at: '',
      rule_id: null,
    },
  ] as never;
  render(<MiscDownloadsSection downloads={downloads} onDelete={() => {}} />);
  expect(screen.getByRole('button', { name: /2/ })).toBeInTheDocument();
  expect(screen.queryByText('[manual] foo')).toBeNull();
  await user.click(screen.getByRole('button', { name: /2/ }));
  expect(screen.getByText('[manual] foo')).toBeInTheDocument();
  expect(screen.getByText('[manual] bar')).toBeInTheDocument();
});

test('returns null when no downloads', () => {
  const { container } = render(<MiscDownloadsSection downloads={[]} onDelete={() => {}} />);
  expect(container.firstChild).toBeNull();
});
