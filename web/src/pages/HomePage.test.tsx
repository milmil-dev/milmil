import React from 'react';
import { vi, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
  useRouterState: ({ select }: { select?: (s: { location: { pathname: string } }) => unknown } = {}) => {
    const state = { location: { pathname: '/' } };
    return select ? select(state) : state;
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[1] as string;
    if (key === 'calendar') return { data: [] };
    if (key === 'trending') {
      return {
        data: Array.from({ length: 10 }, (_, i) => ({
          bangumi_id: i + 1,
          title: `Anime ${i + 1}`,
          title_original: `Anime ${i + 1}`,
          cover_image: '',
          episode_count: 12,
          score: 8.0,
        })),
      };
    }
    if (key === 'recent') {
      return {
        data: [
          {
            id: '1',
            user_id: 'u1',
            episode_id: 'e1',
            media_file_id: 'f1',
            position_seconds: 600,
            duration_seconds: 1200,
            completed: 0,
            last_watched_at: '2026-03-26T00:00:00Z',
          },
        ],
      };
    }
    return { data: [] };
  },
}));

vi.mock('motion/react', () => {
  function stub(tag: string) {
    return function MotionStub(props: Record<string, unknown>) {
      return React.createElement(tag, {
        className: props.className,
        style: props.style,
      }, props.children as React.ReactNode);
    };
  }
  return {
    motion: {
      div: stub('div'),
      section: stub('section'),
      aside: stub('aside'),
      nav: stub('nav'),
      header: stub('header'),
      p: stub('p'),
      span: stub('span'),
      a: stub('a'),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span data-testid="icon" />,
}));

vi.mock('@hugeicons/core-free-icons', () => ({
  FolderLibraryIcon: 'mock-icon',
}));

import { HomePage } from '@/pages/HomePage';

test('home page shows continue watching and trending as distinct dashboard sections', () => {
  render(<HomePage />);
  expect(screen.getByText('繼續觀看')).toBeInTheDocument();
  expect(screen.getByText('熱門動畫')).toBeInTheDocument();
});

test('home page renders genre filter strip', () => {
  render(<HomePage />);
  expect(screen.getByText('Action')).toBeInTheDocument();
  expect(screen.getByText('Drama')).toBeInTheDocument();
});
