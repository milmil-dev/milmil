import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, expect, test, vi } from 'vite-plus/test';

// Per-test overrides for the discover fixtures below.
const fixture = vi.hoisted(() => ({
  synopsis: 'A story about an elf mage.',
  episodeCount: 2,
}));

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
  useParams: () => ({ id: '42' }),
  useRouterState: ({
    select,
  }: {
    select?: (s: { location: { pathname: string } }) => unknown;
  } = {}) => {
    const state = { location: { pathname: '/anime/42' } };
    return select ? select(state) : state;
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: () => {},
    setQueryData: () => {},
    getQueryData: () => undefined,
  }),
  useMutation: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false }),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'discover' && queryKey[1] === 'detail') {
      return {
        data: {
          bangumi_id: 42,
          title: 'Frieren',
          title_original: '葬送のフリーレン',
          cover_image: '',
          banner_image: '',
          score: 9.1,
          episode_count: 28,
          synopsis: fixture.synopsis,
          tags: ['Fantasy', 'Adventure'],
          rating: { score: 9.1, total: 5000 },
          air_date: '2023-09-29',
        },
        isLoading: false,
        isError: false,
      };
    }
    if (queryKey[0] === 'discover' && queryKey[1] === 'episodes') {
      const titles = ['The Journey Begins', 'A New Dawn'];
      return {
        data: Array.from({ length: fixture.episodeCount }, (_, i) => ({
          bangumi_episode_id: i + 1,
          sort: i + 1,
          title: titles[i] ?? `Episode ${i + 1}`,
          title_original: '',
          air_date: '2023-09-29',
        })),
      };
    }
    return { data: undefined };
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

vi.mock('@lingui/react', () => ({
  useLingui: () => ({
    i18n: {
      _: (v: unknown) =>
        typeof v === 'object' && v && 'id' in v ? (v as { id: string }).id : String(v),
    },
  }),
}));

vi.mock('@/store/bg-store', () => ({
  useBgStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ image: null, setImage: () => {} }),
}));

import { fireEvent } from '@testing-library/react';
import { AnimeDetailPage } from '@/pages/AnimeDetailPage';

beforeEach(() => {
  fixture.synopsis = 'A story about an elf mage.';
  fixture.episodeCount = 2;
});

test('detail page presents title, synopsis, and episode list', () => {
  render(<AnimeDetailPage />);
  expect(screen.getByText('Frieren')).toBeInTheDocument();
  expect(screen.getAllByText(/A story about an elf mage/)[0]).toBeInTheDocument();
  expect(screen.getByText('The Journey Begins')).toBeInTheDocument();
  // Section headings exist (i18n keys rendered via mock)
  const headings = document.querySelectorAll('h2');
  expect(headings.length).toBeGreaterThanOrEqual(1);
});

test('detail page shows score and tags', () => {
  render(<AnimeDetailPage />);
  expect(screen.getByText(/9\.1/)).toBeInTheDocument();
  expect(screen.getByText(/Fantasy/)).toBeInTheDocument();
});

// The msg macro compiles to hashed ids here, so toggles are found by state.
// Labelled ones (an episode's info button) aren't show-more toggles.
function expandToggles() {
  return document.querySelectorAll('button[aria-expanded]:not([aria-label])');
}

test('short synopsis has no expand toggle', () => {
  render(<AnimeDetailPage />);
  expect(expandToggles()).toHaveLength(0);
});

test('long synopsis is clamped behind a show-more toggle', () => {
  fixture.synopsis = 'Frieren walks on. '.repeat(20);
  render(<AnimeDetailPage />);
  const [toggle] = expandToggles();
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByText(/Frieren walks on/)).toHaveClass('line-clamp-3');
  fireEvent.click(toggle!);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText(/Frieren walks on/)).not.toHaveClass('line-clamp-3');
});

test('long episode lists collapse to a preview until expanded', () => {
  fixture.episodeCount = 30;
  render(<AnimeDetailPage />);
  expect(screen.getByText('Episode 24')).toBeInTheDocument();
  expect(screen.queryByText('Episode 25')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /\(\+6\)/ }));
  expect(screen.getByText('Episode 30')).toBeInTheDocument();
});
