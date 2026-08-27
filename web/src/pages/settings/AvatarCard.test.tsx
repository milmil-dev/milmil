import { beforeEach, expect, test, vi } from 'vite-plus/test';
import { render, screen, userEvent, waitFor } from '@/test/test-utils';

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span data-testid="icon" />,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  putForm: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  api: apiMock,
  apiUrl: (path: string) => path,
}));

import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth-store';
import { AvatarCard } from './AvatarCard';

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    token: 'mlml_test',
    user: { id: 'u1', username: 'daisy', avatar_url: '/api/v1/users/u1/avatar?v=1' },
    initialized: true,
  });
  apiMock.get.mockImplementation(async (path: string) => {
    if (path === '/api/v1/auth/me') return { id: 'u1', username: 'daisy', avatar_url: null };
    if (path.startsWith('/api/v1/collection'))
      return [
        {
          id: 'a1',
          bangumi_id: 530725,
          title: 'Bleach',
          title_zh: '死神',
          cover_image_url: 'https://img/bleach.jpg',
        },
      ];
    if (path.startsWith('/api/v1/discover/anime/530725'))
      return {
        characters: [
          { role: 'MAIN', character: { id: 1, name: 'Ichigo', image: 'https://img/ichigo.jpg' } },
          { role: 'MAIN', character: { id: 2, name: 'No art' } },
        ],
      };
    return [];
  });
  apiMock.put.mockResolvedValue({ avatar_url: '/api/v1/users/u1/avatar?v=2' });
  apiMock.delete.mockResolvedValue(undefined);
});

test('shows the current avatar and removes it', async () => {
  const user = userEvent.setup();
  render(<AvatarCard />);

  expect(screen.getByTestId('user-avatar-image')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /account.avatar.remove/i }));

  await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith('/api/v1/auth/me/avatar'));
  await waitFor(() => expect(useAuthStore.getState().user?.avatar_url).toBeNull());
  expect(screen.getByTestId('user-avatar-initial')).toHaveTextContent('D');
  expect(toast.success).toHaveBeenCalled();
});

test('picks a character from the collection as the avatar', async () => {
  const user = userEvent.setup();
  render(<AvatarCard />);

  await user.click(screen.getByRole('button', { name: /account.avatar.useCharacter/i }));
  await user.click(await screen.findByRole('button', { name: /死神/ }));
  await user.click(await screen.findByRole('button', { name: /Ichigo/ }));

  await waitFor(() =>
    expect(apiMock.put).toHaveBeenCalledWith('/api/v1/auth/me/avatar', {
      source_url: 'https://img/ichigo.jpg',
    })
  );
  expect(screen.queryByRole('button', { name: /No art/ })).not.toBeInTheDocument();
});

test('hides Remove when there is no avatar', () => {
  useAuthStore.setState({ user: { id: 'u1', username: 'daisy', avatar_url: null } });
  render(<AvatarCard />);
  expect(screen.queryByRole('button', { name: /account.avatar.remove/i })).not.toBeInTheDocument();
  expect(screen.getByTestId('user-avatar-initial')).toHaveTextContent('D');
});
