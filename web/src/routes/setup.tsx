import { createFileRoute } from '@tanstack/react-router';
import { type SetupStatus, setupApi } from '../lib/api/setup';
import { SetupLayout } from '../pages/setup/SetupLayout';

export const Route = createFileRoute('/setup')({
  beforeLoad: async () => {
    try {
      const status = await setupApi.getStatus();
      return { status };
    } catch {
      // API unreachable — degrade gracefully to "fresh install" assumption,
      // which lands the user on /setup/admin. Better than the generic error
      // boundary on first-run when docker-compose is still booting.
      return {
        status: { has_admin: false, library_count: 0 } satisfies SetupStatus,
      };
    }
  },
  component: SetupLayout,
});
