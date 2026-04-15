import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const RenameHistoryPage = lazy(() =>
  import('../pages/library/RenameHistoryPage').then((m) => ({
    default: m.RenameHistoryPage,
  }))
);

export const Route = createFileRoute('/libraries_/$id/rename/history')({
  component: RenameHistoryPage,
});
