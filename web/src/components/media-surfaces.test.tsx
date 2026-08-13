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
      aside: stub('aside'),
      nav: stub('nav'),
      header: stub('header'),
      p: stub('p'),
      span: stub('span'),
      a: stub('a'),
      section: stub('section'),
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

import { AnimeCard } from '@/components/AnimeCard';
import { ContinueWatchingCard } from '@/components/ContinueWatchingCard';
import { EpisodeListItem } from '@/components/EpisodeListItem';

test('anime card exposes title and metadata in a denser media surface', () => {
  render(
    <AnimeCard
      anime={{
        bangumi_id: 1,
        title: 'Test Anime',
        title_original: 'テスト',
        cover_image: '',
        score: 8.2,
        episode_count: 12,
      }}
    />
  );
  expect(screen.getAllByText('Test Anime').length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText(/12/)).toBeInTheDocument();
});

test('continue watching card renders progress and anime info', () => {
  render(
    <ContinueWatchingCard
      title="Frieren"
      episodeLabel="EP 5"
      progress={0.6}
      coverImage=""
      href="/watch/123"
    />
  );
  expect(screen.getByText('Frieren')).toBeInTheDocument();
  expect(screen.getByText('EP 5')).toBeInTheDocument();
});

test('episode list item shows episode number and title', () => {
  render(
    <EpisodeListItem sort={3} title="The Journey Begins" isActive={false} href="/watch/456" />
  );
  expect(screen.getByText('3')).toBeInTheDocument();
  expect(screen.getByText('The Journey Begins')).toBeInTheDocument();
});

test('episode list item marks active episode', () => {
  render(<EpisodeListItem sort={1} title="Pilot" isActive={true} href="/watch/789" />);
  const link = screen.getByText('Pilot').closest('a');
  expect(link?.className).toContain('accent');
});
