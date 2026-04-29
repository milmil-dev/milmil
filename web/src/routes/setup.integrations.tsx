import { createFileRoute, redirect } from '@tanstack/react-router';
import { IntegrationsStep } from '../pages/setup/IntegrationsStep';
import { useAuthStore } from '../store/auth-store';

export const Route = createFileRoute('/setup/integrations')({
  beforeLoad: ({ context }) => {
    if (!context.status.has_admin) {
      throw redirect({ to: '/setup/admin' });
    }
    if (context.status.library_count === 0) {
      throw redirect({ to: '/setup/library' });
    }
    if (!useAuthStore.getState().token) {
      throw redirect({ to: '/login' });
    }
  },
  component: IntegrationsStep,
});
