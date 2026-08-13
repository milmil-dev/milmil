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
  useParams: () => ({ fileId: 'test-file-123' }),
  useSearch: () => ({ episodeId: 'ep1' }),
  useRouterState: ({
    select,
  }: {
    select?: (s: { location: { pathname: string } }) => unknown;
  } = {}) => {
    const state = { location: { pathname: '/watch/test-file-123' } };
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
    if (queryKey[0] === 'danmaku') return { data: { count: 42, comments: [] } };
    if (queryKey[0] === 'subtitles') return { data: [] };
    if (queryKey[0] === 'progress') return { data: null };
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

vi.mock('@/components/VideoPlayer', () => ({
  VideoPlayer: () => <div data-testid="video-player" />,
}));

vi.mock('@/components/DanmakuOverlay', () => ({
  DanmakuOverlay: () => <div data-testid="danmaku-overlay" />,
}));

vi.mock('@/components/DanmakuSettings', () => ({
  DanmakuSettings: () => <div data-testid="danmaku-settings" />,
}));

vi.mock('@/store/preferences-store', () => {
  const usePreferencesStore = (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ danmakuOpacity: 1, danmakuFontSize: 24 });
  // WatchPage calls usePreferencesStore.subscribe() in a useEffect
  (usePreferencesStore as unknown as { subscribe: () => () => void }).subscribe = () => () => {};
  (usePreferencesStore as unknown as { getState: () => Record<string, unknown> }).getState =
    () => ({});
  return { usePreferencesStore };
});

vi.mock('@/lib/api/stream', () => ({
  getStreamUrl: () => 'http://localhost/stream/test',
  parseDandanplayComments: () => [],
  mediaApi: { info: () => Promise.resolve(null) },
  mediaKeys: { info: (fileId: string) => ['media', 'info', fileId] },
}));

vi.mock('@/lib/api/subtitle', () => ({
  subtitleApi: { list: () => Promise.resolve([]) },
  getSubtitleUrl: () => '',
}));

vi.mock('@/lib/api/progress', () => ({
  progressApi: { byFile: () => Promise.resolve(null), save: () => Promise.resolve({}) },
  progressKeys: { byFile: (id: string) => ['progress', 'file', id] },
}));

vi.mock('@lingui/react', () => ({
  useLingui: () => ({
    i18n: {
      _: (v: unknown) =>
        typeof v === 'object' && v && 'id' in v ? (v as { id: string }).id : String(v),
    },
  }),
}));

import { WatchPage } from '@/pages/WatchPage';

test('watch page includes player context beyond the video surface', () => {
  render(<WatchPage />);
  // Context panel section headings exist (rendered as i18n keys via mock)
  const headings = document.querySelectorAll('h3');
  expect(headings.length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText('test-file-123')).toBeInTheDocument();
});

test('watch page renders the video player', () => {
  render(<WatchPage />);
  expect(screen.getByTestId('video-player')).toBeInTheDocument();
});
