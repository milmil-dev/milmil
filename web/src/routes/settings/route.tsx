import { createFileRoute, redirect } from '@tanstack/react-router';
import { SettingsLayout } from '../../pages/settings/SettingsLayout';

export const Route = createFileRoute('/settings')({
  component: SettingsLayout,
  beforeLoad: ({ location }) => {
    if (location.pathname === '/settings') {
      throw redirect({ to: '/settings/general' });
    }
  },
});
