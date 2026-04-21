import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { HistoryPage } from './HistoryPage';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => {},
  useSearch: () => ({ filter: 'all', q: '' }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock('@lingui/react', () => ({
  useLingui: () => ({
    i18n: {
      _: (v: unknown) =>
        typeof v === 'string' ? v : v && typeof v === 'object' && 'id' in v ? (v as { id: string }).id : String(v),
      locale: 'en',
    },
  }),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return {
    ...actual,
    useInfiniteQuery: () => ({
      data: { pages: [{ items: [], next_before: null }] },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: () => {},
    }),
    useMutation: () => ({ mutateAsync: vi.fn() }),
    useQueryClient: () => ({ invalidateQueries: () => {} }),
  };
});

vi.mock('sonner', () => ({ toast: { error: () => {} } }));
vi.mock('../hooks/use-document-title', () => ({ useDocumentTitle: () => {} }));
vi.mock('../components/PageTransition', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('HistoryPage', () => {
  it('renders the empty state when there are no items', () => {
    render(<HistoryPage />);
    expect(screen.getByText('history.empty.title')).toBeTruthy();
  });
});
