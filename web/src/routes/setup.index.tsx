import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/setup/')({
  loader: ({ context }) => {
    if (!context.status.has_admin) {
      throw redirect({ to: '/setup/admin' });
    }
    if (context.status.library_count === 0) {
      throw redirect({ to: '/setup/library' });
    }
    throw redirect({ to: '/setup/integrations' });
  },
});
