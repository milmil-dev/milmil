import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const LibrariesPage = lazy(() =>
  import('../pages/LibrariesPage').then((m) => ({ default: m.LibrariesPage }))
);

export const Route = createFileRoute('/libraries')({
  component: LibrariesPage,
});
