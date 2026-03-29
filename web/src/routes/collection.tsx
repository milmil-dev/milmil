import { createFileRoute } from '@tanstack/react-router';
import { CollectionPage } from '../pages/CollectionPage';

export const Route = createFileRoute('/collection')({
  component: CollectionPage,
});
