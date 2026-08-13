// web/src/components/downloads/AnimeCoverBlock.test.tsx
import { fireEvent } from '@testing-library/react';
import { expect, test } from 'vite-plus/test';
import { render, screen } from '@/test/test-utils';
import { AnimeCoverBlock } from './AnimeCoverBlock';

test('renders img when coverUrl provided', () => {
  render(<AnimeCoverBlock coverUrl="https://example.com/a.jpg" title="Title" />);
  const img = screen.getByRole('img');
  expect(img).toHaveAttribute('src', 'https://example.com/a.jpg');
  expect(img).toHaveAttribute('alt', 'Title');
});

test('renders placeholder letter when coverUrl missing', () => {
  const { container } = render(<AnimeCoverBlock coverUrl={undefined} title="Frieren" />);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('F')).toBeInTheDocument();
});

test('falls back to placeholder on img error', () => {
  render(<AnimeCoverBlock coverUrl="https://bad.example/x.jpg" title="Naruto" />);
  const img = screen.getByRole('img');
  fireEvent.error(img);
  expect(screen.getByText('N')).toBeInTheDocument();
});
