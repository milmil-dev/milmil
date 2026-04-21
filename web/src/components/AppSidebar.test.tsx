import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, expect, test, vi } from 'vitest';

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
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span data-testid="icon" />,
}));

vi.mock('@hugeicons/core-free-icons', () => ({
  Bookmark01Icon: 'mock-icon',
  Calendar03Icon: 'mock-icon',
  Clock01Icon: 'mock-icon',
  Download04Icon: 'mock-icon',
  FireIcon: 'mock-icon',
  FolderLibraryIcon: 'mock-icon',
  HouseIcon: 'mock-icon',
  Logout01Icon: 'mock-icon',
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

import { MobileNav } from '@/components/AppSidebar';

beforeEach(() => {
  vi.clearAllMocks();
});

test('mobile nav renders bottom navigation bar with key items', () => {
  render(<MobileNav />);
  // i18n keys rendered via mock
  const links = document.querySelectorAll('a[href]');
  expect(links.length).toBeGreaterThanOrEqual(5);
});

test('mobile nav is styled as a fixed bottom bar', () => {
  const { container } = render(<MobileNav />);
  const nav = container.querySelector('nav');
  expect(nav).not.toBeNull();
  expect(nav?.className).toContain('fixed');
  expect(nav?.className).toContain('bottom-0');
});
