import { createFileRoute } from '@tanstack/react-router';
import { setupApi } from '../lib/api/setup';
import { SetupLayout } from '../pages/setup/SetupLayout';

export const Route = createFileRoute('/setup')({
  beforeLoad: async () => {
    const status = await setupApi.getStatus();
    return { status };
  },
  component: SetupLayout,
});
