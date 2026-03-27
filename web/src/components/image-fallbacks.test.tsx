import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    className,
    style,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
    style?: Record<string, unknown>;
  }) => (
    <a href={to} className={className} style={style}>
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

import { AnimeCard } from '@/components/AnimeCard';
import { AnimeRow } from '@/components/AnimeRow';

test('anime card renders a gradient surface when cover_image is empty', () => {
  const { container } = render(
    <AnimeCard
      anime={{
        bangumi_id: 1,
        title: 'Fallback Test',
        title_original: '',
        cover_image: '',
        score: 0,
        episode_count: 0,
      }}
    />
  );
  expect(screen.getAllByText('Fallback Test').length).toBeGreaterThanOrEqual(1);
  // Should have a gradient background style on the poster area
  const posterDiv = container.querySelector('[style*="gradient"]');
  expect(posterDiv).not.toBeNull();
});

test('anime row still renders when cover image is missing', () => {
  render(
    <AnimeRow
      anime={{
        bangumi_id: 2,
        title: 'No Cover',
        title_original: 'ノーカバー',
        cover_image: '',
        score: 7.5,
        episode_count: 24,
      }}
    />
  );
  expect(screen.getByText('No Cover')).toBeInTheDocument();
  expect(screen.getByText('7.5')).toBeInTheDocument();
});

test('anime card handles broken image gracefully by showing gradient fallback', () => {
  const { container } = render(
    <AnimeCard
      anime={{
        bangumi_id: 3,
        title: 'Broken Image',
        title_original: '',
        cover_image: 'http://broken.example/img.jpg',
        score: 8.0,
        episode_count: 12,
      }}
    />
  );
  // Image should exist initially
  expect(container.querySelector('img')).not.toBeNull();
  // Simulate image error
  fireEvent.error(container.querySelector('img')!);
  // Image should be gone, replaced by gradient fallback
  expect(container.querySelector('img')).toBeNull();
  // Gradient fallback should appear
  expect(container.querySelector('[style*="gradient"]')).not.toBeNull();
  // Title still visible
  expect(screen.getAllByText('Broken Image').length).toBeGreaterThanOrEqual(1);
});
