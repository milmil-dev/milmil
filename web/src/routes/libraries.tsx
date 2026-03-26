import { createFileRoute } from '@tanstack/react-router';
import { LibrariesPage } from '../pages/LibrariesPage';

export const Route = createFileRoute('/libraries')({
  component: LibrariesPage,
});
