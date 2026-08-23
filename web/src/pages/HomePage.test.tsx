import { render, screen } from '@testing-library/react';
import React from 'react';
import { expect, test, vi } from 'vite-plus/test';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => {},
  Link: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useRouterState: ({
    select,
  }: {
    select?: (s: { location: { pathname: string } }) => unknown;
  } = {}) => {
    const state = { location: { pathname: '/' } };
    return select ? select(state) : state;
  },
}));

// Lingui macros are compiled by Vite plugin — no mock needed for @lingui/core/macro
// Only mock the runtime hook to return message IDs as-is
vi.mock('@lingui/react', () => ({
  useLingui: () => ({
    i18n: {
      locale: 'en',
      _: (v: unknown) => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object' && 'id' in v) return (v as { id: string }).id;
        return String(v);
      },
    },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: () => {},
    setQueryData: () => {},
    getQueryData: () => undefined,
  }),
  useMutation: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false }),
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
      return React.createElement(
        tag,
        {
          className: props.className,
          style: props.style,
        },
        props.children as React.ReactNode
      );
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
  ArrowLeft02Icon: 'mock-icon',
  ArrowRight02Icon: 'mock-icon',
}));

vi.mock('@/store/bg-store', () => ({
  useBgStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ image: null, setImage: () => {} }),
}));

import { HomePage } from '@/pages/HomePage';

test('home page renders section headings for continue watching and trending', () => {
  render(<HomePage />);
  // Section headings rendered via SectionHeader as <h2>
  const headings = screen.getAllByRole('heading', { level: 2 });
  expect(headings.length).toBeGreaterThanOrEqual(2);
});

test('home page renders genre filter strip', () => {
  render(<HomePage />);
  expect(screen.getByText('Action')).toBeInTheDocument();
  expect(screen.getByText('Drama')).toBeInTheDocument();
});
