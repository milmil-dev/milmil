import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const NotificationsPage = lazy(() =>
  import('../pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage }))
);

export const Route = createFileRoute('/notifications')({
  component: NotificationsPage,
});
