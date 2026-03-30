import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const DownloadsPage = lazy(() =>
  import('../pages/DownloadsPage').then((m) => ({ default: m.DownloadsPage }))
);

export const Route = createFileRoute('/downloads')({
  component: DownloadsPage,
});
