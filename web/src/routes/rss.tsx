import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const RSSPage = lazy(() =>
  import('../pages/RSSPage').then((m) => ({ default: m.RSSPage })),
);

export const Route = createFileRoute('/rss')({
  component: RSSPage,
});
