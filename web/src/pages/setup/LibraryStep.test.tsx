import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => {},
}));

vi.mock('../../store/auth-store', () => ({
  useAuthStore: { getState: () => ({ token: 'fake-token' }) },
}));

vi.mock('../../hooks/use-document-title', () => ({
  useDocumentTitle: () => {},
}));

const testConnection = vi.fn();
const createLibrary = vi.fn();
const scanLibrary = vi.fn();
vi.mock('../../lib/api/library', () => ({
  libraryApi: {
    testConnection: (...args: unknown[]) => testConnection(...args),
    create: (...args: unknown[]) => createLibrary(...args),
    scan: (...args: unknown[]) => scanLibrary(...args),
  },
}));

vi.mock('@lingui/react', () => ({
  useLingui: () => ({
    i18n: {
      _: (m: { id?: string; message?: string } | string) =>
        typeof m === 'string' ? m : (m.message ?? m.id ?? ''),
    },
  }),
}));

vi.mock('motion/react', () => {
  function stub(tag: string) {
    return function MotionStub(props: Record<string, unknown>) {
      return React.createElement(
        tag,
        {
          className: props.className,
          style: props.style,
          role: props.role,
          'data-slot': props['data-slot'],
          'data-orientation': props['data-orientation'],
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

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span data-testid="icon" />,
}));

vi.mock('@hugeicons/core-free-icons', () => ({
  Loading03Icon: 'mock-icon',
}));

import { LibraryStep } from './LibraryStep';

describe('LibraryStep — blur validation', () => {
  beforeEach(() => {
    testConnection.mockReset();
    createLibrary.mockReset();
    scanLibrary.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  test('shows ✓ when test-connection returns ok', async () => {
    testConnection.mockResolvedValueOnce({ ok: true });
    render(<LibraryStep />);

    const pathInput = screen.getByLabelText(/setup\.library\.pathLabel/);
    fireEvent.blur(pathInput);

    await waitFor(() => {
      expect(screen.getByText(/setup\.library\.pathReadable/)).toBeInTheDocument();
    });
    expect(testConnection).toHaveBeenCalledWith({
      source_type: 'local',
      source_config: {},
      path: '/media',
    });
  });

  test('shows ✗ with server error message when ok=false', async () => {
    testConnection.mockResolvedValueOnce({ ok: false, error: 'no such file' });
    render(<LibraryStep />);

    fireEvent.blur(screen.getByLabelText(/setup\.library\.pathLabel/));

    await waitFor(() => {
      expect(screen.getByText(/no such file/)).toBeInTheDocument();
    });
  });

  test('shows ✗ with fallback when fetch throws', async () => {
    testConnection.mockRejectedValueOnce(new Error('boom'));
    render(<LibraryStep />);

    fireEvent.blur(screen.getByLabelText(/setup\.library\.pathLabel/));

    await waitFor(() => {
      expect(screen.getByText(/pathCheckFailed/)).toBeInTheDocument();
    });
  });

  test('renders nothing when path is empty', () => {
    render(<LibraryStep />);
    const input = screen.getByLabelText(/setup\.library\.pathLabel/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(screen.queryByText(/pathReadable|pathCheckFailed/)).toBeNull();
  });
});

describe('LibraryStep — submit', () => {
  beforeEach(() => {
    testConnection.mockReset();
    createLibrary.mockReset();
    scanLibrary.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  test('creates library then fires scan and navigates', async () => {
    testConnection.mockResolvedValueOnce({ ok: true });
    createLibrary.mockResolvedValueOnce({ id: 'lib-1', name: 'Anime', path: '/media' });
    scanLibrary.mockResolvedValueOnce(undefined);

    render(<LibraryStep />);
    fireEvent.change(screen.getByLabelText(/setup\.library\.nameLabel/), {
      target: { value: 'Anime' },
    });
    fireEvent.blur(screen.getByLabelText(/setup\.library\.pathLabel/));
    await waitFor(() => screen.getByText(/pathReadable/));

    fireEvent.click(screen.getByRole('button', { name: /setup\.library\.submit|creating/i }));

    await waitFor(() => {
      expect(createLibrary).toHaveBeenCalledWith({
        name: 'Anime',
        path: '/media',
        source_type: 'local',
        source_config: {},
        scan_interval_minutes: 60,
      });
      expect(scanLibrary).toHaveBeenCalledWith('lib-1');
    });
  });
});
