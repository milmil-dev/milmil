import { render } from '@testing-library/react';
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
  useRouterState: ({
    select,
  }: {
    select?: (s: { location: { pathname: string } }) => unknown;
  } = {}) => {
    const state = { location: { pathname: '/' } };
    return select ? select(state) : state;
  },
  createRootRoute: vi.fn(),
  Outlet: () => <div data-testid="outlet" />,
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

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span data-testid="icon" />,
}));

vi.mock('@hugeicons/core-free-icons', () => ({
  Calendar03Icon: 'mock-icon',
  Download04Icon: 'mock-icon',
  FireIcon: 'mock-icon',
  FolderLibraryIcon: 'mock-icon',
  HouseIcon: 'mock-icon',
  MagnetIcon: 'mock-icon',
  Menu01Icon: 'mock-icon',
  RssIcon: 'mock-icon',
  Search01Icon: 'mock-icon',
  Setting07Icon: 'mock-icon',
}));

vi.mock('@lingui/react', () => ({
  useLingui: () => ({
    i18n: {
      _: (v: unknown) =>
        typeof v === 'object' && v && 'id' in v ? (v as { id: string }).id : String(v),
    },
  }),
}));

import { AppSidebar } from '@/components/AppSidebar';

test('renders the sidebar with navigation links', () => {
  render(<AppSidebar />);
  const links = document.querySelectorAll('a[href]');
  expect(links.length).toBeGreaterThanOrEqual(5);
});

test('sidebar renders logo', () => {
  const { container } = render(<AppSidebar />);
  // Logo is an <img> pointing to /icons/logo.svg
  const img = container.querySelector('img[src="/icons/logo.svg"]');
  expect(img).not.toBeNull();
});

test('sidebar has nav links as anchor elements', () => {
  render(<AppSidebar />);
  const links = document.querySelectorAll('a[href]');
  expect(links.length).toBeGreaterThanOrEqual(5);
});
