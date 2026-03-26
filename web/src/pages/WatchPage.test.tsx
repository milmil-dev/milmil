import React from 'react';
import { vi, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
  useParams: () => ({ fileId: 'test-file-123' }),
  useSearch: () => ({ episodeId: 'ep1' }),
  useRouterState: ({ select }: { select?: (s: { location: { pathname: string } }) => unknown } = {}) => {
    const state = { location: { pathname: '/watch/test-file-123' } };
    return select ? select(state) : state;
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'danmaku') return { data: { count: 42, comments: [] } };
    if (queryKey[0] === 'subtitles') return { data: [] };
    if (queryKey[0] === 'progress') return { data: null };
    return { data: undefined };
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

vi.mock('@/components/VideoPlayer', () => ({
  VideoPlayer: () => <div data-testid="video-player" />,
}));

vi.mock('@/components/DanmakuOverlay', () => ({
  DanmakuOverlay: () => <div data-testid="danmaku-overlay" />,
}));

vi.mock('@/components/DanmakuSettings', () => ({
  DanmakuSettings: () => <div data-testid="danmaku-settings" />,
}));

vi.mock('@/store/player-store', () => ({
  usePlayerStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ danmakuOpacity: 1, danmakuFontSize: 24 }),
}));

vi.mock('@/lib/api/stream', () => ({
  getStreamUrl: () => 'http://localhost/stream/test',
  parseDandanplayComments: () => [],
}));

vi.mock('@/lib/api/subtitle', () => ({
  subtitleApi: { list: () => Promise.resolve([]) },
  getSubtitleUrl: () => '',
}));

vi.mock('@/lib/api/progress', () => ({
  progressApi: { byFile: () => Promise.resolve(null), save: () => Promise.resolve({}) },
  progressKeys: { byFile: (id: string) => ['progress', 'file', id] },
}));

import { WatchPage } from '@/pages/WatchPage';

test('watch page includes player context beyond the video surface', () => {
  render(<WatchPage />);
  expect(screen.getByText('彈幕')).toBeInTheDocument();
  expect(screen.getByText(/42 條彈幕/)).toBeInTheDocument();
  expect(screen.getByText('媒體檔案')).toBeInTheDocument();
});

test('watch page renders the video player', () => {
  render(<WatchPage />);
  expect(screen.getByTestId('video-player')).toBeInTheDocument();
});
