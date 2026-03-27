import { fireEvent, render, screen } from '@testing-library/react';
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
          onClick: props.onClick,
        },
        props.children as React.ReactNode
      );
    };
  }
  return {
    motion: {
      div: stub('div'),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { Modal } from '@/components/Modal';

test('modal renders children when open', () => {
  render(
    <Modal open={true} onClose={() => {}}>
      <p>Modal content</p>
    </Modal>
  );
  expect(screen.getByText('Modal content')).toBeInTheDocument();
});

test('modal renders title when provided', () => {
  render(
    <Modal open={true} onClose={() => {}} title="Test Title">
      <p>Content</p>
    </Modal>
  );
  expect(screen.getByText('Test Title')).toBeInTheDocument();
});

test('modal does not render when closed', () => {
  render(
    <Modal open={false} onClose={() => {}}>
      <p>Hidden content</p>
    </Modal>
  );
  expect(screen.queryByText('Hidden content')).toBeNull();
});

test('modal calls onClose when escape is pressed', () => {
  const onClose = vi.fn();
  render(
    <Modal open={true} onClose={onClose}>
      <p>Content</p>
    </Modal>
  );
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});
