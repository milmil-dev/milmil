import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const AnimeDetailPage = lazy(() =>
  import('../pages/AnimeDetailPage').then((m) => ({ default: m.AnimeDetailPage }))
);

export const Route = createFileRoute('/anime/$id')({ component: AnimeDetailPage });
