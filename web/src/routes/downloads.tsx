import { createFileRoute } from '@tanstack/react-router';
import { DownloadsPage } from '../pages/DownloadsPage';

export const Route = createFileRoute('/downloads')({
  component: DownloadsPage,
});
