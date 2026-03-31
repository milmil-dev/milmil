import { createFileRoute } from '@tanstack/react-router';
import { StoragePanel } from '../../pages/settings/StoragePanel';

export const Route = createFileRoute('/settings/storage')({
  component: StoragePanel,
});
