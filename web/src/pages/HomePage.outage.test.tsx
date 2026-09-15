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
    if (key === 'calendar' || key === 'trending') {
      return { data: undefined, isPending: false, isError: true, isLoading: false };
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
            anime_title: 'Continue Me',
            anime_cover_image: '',
            episode_number: 3,
          },
        ],
        isPending: false,
      };
    }
    return { data: [], isPending: false, isLoading: false, isError: true };
  },
}));

vi.mock('motion/react', () => {
  function stub(tag: string) {
    return function MotionStub(props: Record<string, unknown>) {
      const passthrough: Record<string, unknown> = {
        className: props.className,
        style: props.style,
        children: props.children as React.ReactNode,
      };
      if (props['data-testid']) passthrough['data-testid'] = props['data-testid'];
      if (props.role) passthrough.role = props.role;
      return React.createElement(tag, passthrough);
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
    useReducedMotion: () => false,
  };
});

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span data-testid="icon" />,
}));

vi.mock('@hugeicons/core-free-icons', () => ({
  FolderLibraryIcon: 'mock-icon',
  ArrowLeft02Icon: 'mock-icon',
  ArrowRight01Icon: 'mock-icon',
  ArrowRight02Icon: 'mock-icon',
}));

vi.mock('@/store/bg-store', () => ({
  useBgStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ image: null, setImage: () => {} }),
}));

vi.mock('@/components/AnimeCard', () => ({
  AnimeCard: ({ anime }: { anime: { title: string } }) => <div>{anime.title}</div>,
}));

vi.mock('@/components/ContinueWatchingCard', () => ({
  ContinueWatchingCard: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/components/HeroBanner', () => ({
  HeroBanner: () => null,
}));

vi.mock('@/components/MediaRail', () => ({
  MediaRail: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/PageTransition', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { HomePage } from '@/pages/HomePage';

test('home still shows continue watching when discover upstreams fail', () => {
  render(<HomePage />);
  expect(screen.getByText('Continue Me')).toBeInTheDocument();
  expect(screen.queryByTestId('home-trending')).not.toBeInTheDocument();
});
