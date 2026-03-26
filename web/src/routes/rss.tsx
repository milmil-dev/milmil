import { createFileRoute } from '@tanstack/react-router';
import { RSSPage } from '../pages/RSSPage';

export const Route = createFileRoute('/rss')({
  component: RSSPage,
});
