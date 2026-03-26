import { createFileRoute } from '@tanstack/react-router';
import { TrendingPage } from '../pages/TrendingPage';
export const Route = createFileRoute('/trending')({ component: TrendingPage });
