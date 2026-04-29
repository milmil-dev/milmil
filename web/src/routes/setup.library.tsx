import { createFileRoute, redirect } from '@tanstack/react-router';
import { LibraryStep } from '../pages/setup/LibraryStep';
import { useAuthStore } from '../store/auth-store';

export const Route = createFileRoute('/setup/library')({
  beforeLoad: ({ context }) => {
    if (!context.status.has_admin) {
      throw redirect({ to: '/setup/admin' });
    }
    if (context.status.library_count >= 1) {
      throw redirect({ to: '/setup/integrations' });
    }
    if (!useAuthStore.getState().token) {
      throw redirect({ to: '/login' });
    }
  },
  component: LibraryStep,
});
