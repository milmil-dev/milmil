import { render, screen } from '@testing-library/react';
import React from 'react';
import { expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
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
          synopsis: 'A story about an elf mage.',
          tags: ['Fantasy', 'Adventure'],
          rating: { score: 9.1, total: 5000 },
          air_date: '2023-09-29',
        },
        isLoading: false,
        isError: false,
      };
    }
    if (queryKey[0] === 'discover' && queryKey[1] === 'episodes') {
      return {
        data: [
          {
            bangumi_episode_id: 1,
            sort: 1,
            title: 'The Journey Begins',
            title_original: '',
            air_date: '2023-09-29',
          },
          {
            bangumi_episode_id: 2,
            sort: 2,
            title: 'A New Dawn',
            title_original: '',
            air_date: '2023-10-06',
          },
        ],
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

import { AnimeDetailPage } from '@/pages/AnimeDetailPage';

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
