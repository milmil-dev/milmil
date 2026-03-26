import React from 'react';
import { vi, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
  useRouterState: ({ select }: { select?: (s: { location: { pathname: string } }) => unknown } = {}) => {
    const state = { location: { pathname: '/' } };
    return select ? select(state) : state;
  },
  createRootRoute: vi.fn(),
  Outlet: () => <div data-testid="outlet" />,
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
  RssIcon: 'mock-icon',
  Search01Icon: 'mock-icon',
  Setting07Icon: 'mock-icon',
}));

import { AppSidebar } from '@/components/AppSidebar';

test('renders the desktop shell with labeled navigation', () => {
  render(<AppSidebar />);
  expect(screen.getByText('Home')).toBeInTheDocument();
  expect(screen.getByText('Schedule')).toBeInTheDocument();
  expect(screen.getByText('Libraries')).toBeInTheDocument();
  expect(screen.getByText('Settings')).toBeInTheDocument();
});

test('sidebar shows labels alongside icons, not only in tooltips', () => {
  render(<AppSidebar />);
  const homeLabel = screen.getByText('Home');
  expect(homeLabel.closest('a')).not.toBeNull();
});

test('sidebar has section groupings', () => {
  render(<AppSidebar />);
  expect(screen.getByText('Browse')).toBeInTheDocument();
  expect(screen.getByText('Manage')).toBeInTheDocument();
});
