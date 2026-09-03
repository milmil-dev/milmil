import { render, screen } from '@testing-library/react';
import React from 'react';
import { expect, test, vi } from 'vite-plus/test';
import { getCurrentSeason, MEMORY_OFFSETS } from '@/lib/season';
import { todayWeekdayEN } from '@/lib/weekday';

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

function fakeAnime(id: number, title: string, extra: Record<string, unknown> = {}) {
  return {
    bangumi_id: id,
    title,
    title_original: title,
    cover_image: '',
    episode_count: 12,
    score: 8.0,
    ...extra,
  };
}

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: () => {},
    setQueryData: () => {},
    getQueryData: () => undefined,
  }),
  useMutation: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false }),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[1] as string;
    if (key === 'calendar') {
      const today = todayWeekdayEN();
      return {
        data: [
          {
            weekday: '星期四',
            weekday_en: today,
            items: [fakeAnime(42, 'Tonight Show', { next_episode: 5 })],
          },
        ],
      };
    }
    if (key === 'trending') {
      return {
        data: Array.from({ length: 10 }, (_, i) => fakeAnime(i + 1, `Anime ${i + 1}`)),
      };
    }
    if (key === 'topSeason') {
      return { data: [fakeAnime(100, 'Season Best')], isLoading: false };
    }
    if (key === 'memories') {
      const year = queryKey[3] as number;
      return { data: [fakeAnime(year, `Classic ${year}`)], isLoading: false };
    }
    if (key === 'recent') {
      return { data: [] };
    }
    return { data: [], isLoading: false };
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
  AnimeCard: ({ anime, badge }: { anime: { title: string }; badge?: string }) => (
    <div>
      {badge ? <span>{badge}</span> : null}
      {anime.title}
    </div>
  ),
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

test('today’s schedule is a poster shelf with the JST weekday mark', () => {
  render(<HomePage />);
  const today = screen.getByTestId('home-today');
  expect(today.querySelector('h2')).toBeTruthy();
  // Lingui compiles msg ids to hashes; the mock returns those ids — assert structure.
  expect(today).toHaveTextContent('Tonight Show');
  expect(today).toHaveTextContent('EP 5');
  // macOS uses "時刻表 ›" — destination label, not generic View All.
  expect(today.querySelector('a[href="/schedule"]')).toBeTruthy();
});

test('home carries top-of-season and memories teasers', () => {
  const { year } = getCurrentSeason();
  render(<HomePage />);
  expect(screen.getByTestId('home-top-season')).toHaveTextContent('Season Best');
  const memories = screen.getByTestId('home-memories');
  expect(memories).toBeInTheDocument();
  expect(screen.getByText(`Classic ${year - 10}`)).toBeInTheDocument();
  for (const years of MEMORY_OFFSETS) {
    expect(screen.getByTestId(`memories-era-${years}`)).toBeInTheDocument();
  }
});
