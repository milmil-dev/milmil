import { createFileRoute, redirect } from '@tanstack/react-router';
import { setupApi, SetupStatus } from '../lib/api/setup';
import { SetupLayout } from '../pages/setup/SetupLayout';

export const Route = createFileRoute('/setup')({
  beforeLoad: async (): Promise<{ status: SetupStatus }> => {
    const status = await setupApi.getStatus();
    return { status };
  },
  loader: async ({ context }) => {
    const { status } = context as { status: SetupStatus };
    if (!status.has_admin) {
      throw redirect({ to: '/setup/admin' });
    }
    if (status.library_count === 0) {
      throw redirect({ to: '/setup/library' });
    }
    throw redirect({ to: '/setup/integrations' });
  },
  component: SetupLayout,
});
