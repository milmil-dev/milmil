import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { WatchProgress } from '@/lib/api/progress';
import { HistoryCard } from './HistoryCard';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => {},
  Link: ({
    children,
    to,
    onClick,
  }: {
    children: React.ReactNode;
    to: string;
    onClick?: () => void;
  }) => (
    <a href={to} onClick={onClick}>
      {children}
    </a>
  ),
}));

vi.mock('@lingui/react', () => ({
  useLingui: () => ({
    i18n: {
      _: (v: unknown) =>
        typeof v === 'string'
          ? v
          : v && typeof v === 'object' && 'id' in v
            ? (v as { id: string }).id
            : String(v),
      locale: 'en',
    },
  }),
}));

function mk(overrides: Partial<WatchProgress> = {}): WatchProgress {
  return {
    id: 'wp-1',
    user_id: 'u1',
    episode_id: 'e1',
    media_file_id: null,
    position_seconds: 600,
    duration_seconds: 1440,
    completed: 0,
    last_watched_at: '2026-04-20T14:00:00Z',
    anime_id: 'a1',
    anime_title: 'Frieren',
    anime_title_zh: null,
    anime_cover_image: null,
    anime_bangumi_id: 12345,
    episode_number: 8,
    ...overrides,
  };
}

describe('HistoryCard', () => {
  it('renders in-progress time badge for uncompleted items', () => {
    render(<HistoryCard item={mk()} onDelete={() => {}} />);
    expect(screen.getByText(/10:00 \/ 24:00/)).toBeTruthy();
  });

  it('renders Finished badge for completed items', () => {
    render(<HistoryCard item={mk({ completed: 1, position_seconds: 1440 })} onDelete={() => {}} />);
    expect(screen.getByText('history.finished')).toBeTruthy();
  });

  it('calls onDelete when delete button is clicked', () => {
    const onDelete = vi.fn();
    render(<HistoryCard item={mk()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith('wp-1');
  });
});
