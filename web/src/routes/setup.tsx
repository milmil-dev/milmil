import { createFileRoute, redirect } from '@tanstack/react-router';
import { api } from '../lib/api-client';
import { SetupPage } from '../pages/SetupPage';

interface StatusResponse {
  initialized: boolean;
}

export const Route = createFileRoute('/setup')({
  beforeLoad: async () => {
    const status = await api.get<StatusResponse>('/api/v1/auth/status');
    if (status.initialized) throw redirect({ to: '/login' });
  },
  component: SetupPage,
});
