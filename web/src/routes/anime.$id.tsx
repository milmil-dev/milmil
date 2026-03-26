import { createFileRoute } from '@tanstack/react-router';
import { AnimeDetailPage } from '../pages/AnimeDetailPage';
export const Route = createFileRoute('/anime/$id')({ component: AnimeDetailPage });
