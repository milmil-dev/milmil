import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const LibraryDetailPage = lazy(() =>
  import('../pages/LibraryDetailPage').then((m) => ({ default: m.LibraryDetailPage })),
);

export const Route = createFileRoute('/libraries/$id')({
  component: LibraryDetailPage,
});
