import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { expect, test, vi } from 'vite-plus/test';
import { getCurrentSeason, MEMORY_OFFSETS } from '@/lib/season';

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

function fakeAnime(id: number, title: string) {
  return {
    bangumi_id: id,
    title,
    title_original: title,
    cover_image: '',
    episode_count: 12,
    score: 8.0,
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
    if (key === 'calendar') return { data: [] };
    if (key === 'memories') {
      const year = queryKey[3] as number;
      return { data: [fakeAnime(year, `Classic ${year}`)], isLoading: false };
    }
    if (key === 'trending') {
      return {
        data: Array.from({ length: 10 }, (_, i) => fakeAnime(i + 1, `Anime ${i + 1}`)),
        isLoading: false,
      };
    }
    if (key === 'hotTags') return { data: [], isLoading: false };
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
      };
    }
    return { data: [fakeAnime(99, 'Filler')], isLoading: false };
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

test('home page renders continue watching and catalog rails', () => {
  render(<HomePage />);
  const headings = screen.getAllByRole('heading', { level: 2 });
  expect(headings.length).toBeGreaterThanOrEqual(2);
  expect(screen.getByTestId('home-trending')).toBeInTheDocument();
  expect(screen.getByTestId('home-hot-tags')).toBeInTheDocument();
});

test('home page renders genre filter strip from hot tags', () => {
  render(<HomePage />);
  expect(screen.getByText('Action')).toBeInTheDocument();
  expect(screen.getByText('Drama')).toBeInTheDocument();
});

test('renders the memories section with era tabs', () => {
  render(<HomePage />);
  const section = screen.getByTestId('home-memories');
  expect(section).toBeInTheDocument();
  expect(section.querySelector('h2')).toBeTruthy();
  for (const years of MEMORY_OFFSETS) {
    expect(screen.getByTestId(`memories-era-${years}`)).toBeInTheDocument();
  }
});

test('defaults to ten years ago and switches eras', async () => {
  const user = userEvent.setup();
  const { year } = getCurrentSeason();
  render(<HomePage />);

  expect(screen.getByText(`Classic ${year - 10}`)).toBeInTheDocument();
  expect(screen.getByTestId('memories-era-10')).toHaveAttribute('aria-selected', 'true');

  await user.click(screen.getByTestId('memories-era-5'));
  expect(screen.getByTestId('memories-era-5')).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText(`Classic ${year - 5}`)).toBeInTheDocument();
});
