import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const RenamePreviewPage = lazy(() =>
  import('../pages/library/RenamePreviewPage').then((m) => ({
    default: m.RenamePreviewPage,
  }))
);

export const Route = createFileRoute('/libraries_/$id/rename')({
  component: RenamePreviewPage,
});
