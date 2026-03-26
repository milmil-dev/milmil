import { createFileRoute } from '@tanstack/react-router';
import { TorrentSearchPage } from '../pages/TorrentSearchPage';

export const Route = createFileRoute('/torrent-search')({
  component: TorrentSearchPage,
});
