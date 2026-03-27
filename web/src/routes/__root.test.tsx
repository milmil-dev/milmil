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

import { AppSidebar } from '@/components/AppSidebar';

test('renders the sidebar with navigation links', () => {
  render(<AppSidebar />);
  // Sidebar is icon-only when collapsed — labels show in mobile nav
  // Mobile nav renders Home, Schedule, Search, Libraries, More
  expect(screen.getByText('Home')).toBeInTheDocument();
  expect(screen.getByText('Search')).toBeInTheDocument();
});

test('sidebar renders logo', () => {
  render(<AppSidebar />);
  // Collapsed sidebar shows "m", mobile shows nothing extra
  expect(screen.getByText('m')).toBeInTheDocument();
});

test('sidebar has nav links as anchor elements', () => {
  render(<AppSidebar />);
  const links = document.querySelectorAll('a[href]');
  expect(links.length).toBeGreaterThanOrEqual(5);
});
