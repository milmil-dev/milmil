import { createFileRoute, redirect } from '@tanstack/react-router';
import { AdminStep } from '../pages/setup/AdminStep';

export const Route = createFileRoute('/setup/admin')({
  beforeLoad: ({ context }) => {
    if (context.status.has_admin) {
      // Admin already exists — push them forward in the wizard.
      if (context.status.library_count === 0) {
        throw redirect({ to: '/setup/library' });
      }
      throw redirect({ to: '/setup/integrations' });
    }
  },
  component: AdminStep,
});
