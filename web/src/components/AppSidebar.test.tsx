import React from 'react';
import { vi, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
  useRouterState: ({ select }: { select?: (s: { location: { pathname: string } }) => unknown } = {}) => {
    const state = { location: { pathname: '/' } };
    return select ? select(state) : state;
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

import { MobileNav } from '@/components/AppSidebar';

beforeEach(() => {
  vi.clearAllMocks();
});

test('mobile nav renders bottom navigation bar with key items', () => {
  render(<MobileNav />);
  expect(screen.getByText('Home')).toBeInTheDocument();
  expect(screen.getByText('Schedule')).toBeInTheDocument();
  expect(screen.getByText('Libraries')).toBeInTheDocument();
  expect(screen.getByText('More')).toBeInTheDocument();
});

test('mobile nav is styled as a fixed bottom bar', () => {
  const { container } = render(<MobileNav />);
  const nav = container.querySelector('nav');
  expect(nav).not.toBeNull();
  expect(nav?.className).toContain('fixed');
  expect(nav?.className).toContain('bottom-0');
});
