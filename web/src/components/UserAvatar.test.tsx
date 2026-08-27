import { expect, test } from 'vite-plus/test';
import { fireEvent } from '@testing-library/react';
import { render, screen } from '@/test/test-utils';
import { UserAvatar } from './UserAvatar';

test('renders the initial when the user has no avatar', () => {
  render(<UserAvatar user={{ username: 'daisy' }} size={40} />);
  expect(screen.getByTestId('user-avatar-initial')).toHaveTextContent('D');
  expect(screen.queryByTestId('user-avatar-image')).not.toBeInTheDocument();
});

test('renders the image and falls back to the initial when it breaks', () => {
  render(<UserAvatar user={{ username: 'daisy', avatar_url: '/api/v1/users/u1/avatar?v=1' }} />);
  const img = screen.getByTestId('user-avatar-image');
  expect(img).toHaveAttribute('src', expect.stringContaining('/api/v1/users/u1/avatar?v=1'));
  fireEvent.error(img);
  expect(screen.getByTestId('user-avatar-initial')).toHaveTextContent('D');
});
