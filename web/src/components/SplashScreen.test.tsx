import { render, screen } from '@testing-library/react';
import React from 'react';
import { expect, test, vi } from 'vitest';

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
      h1: stub('h1'),
    },
  };
});

import { SplashScreen } from '@/components/SplashScreen';

test('splash screen renders milmil logo', () => {
  render(<SplashScreen />);
  expect(screen.getByText('milmil')).toBeInTheDocument();
});
