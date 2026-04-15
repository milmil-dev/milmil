import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const LibraryDuplicatesPage = lazy(() =>
  import('../pages/library/LibraryDuplicatesPage').then((m) => ({
    default: m.LibraryDuplicatesPage,
  }))
);

export const Route = createFileRoute('/libraries_/$id/duplicates')({
  component: LibraryDuplicatesPage,
});
