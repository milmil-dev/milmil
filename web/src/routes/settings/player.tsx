import { createFileRoute } from '@tanstack/react-router';
import { PlayerPanel } from '../../pages/settings/PlayerPanel';

export const Route = createFileRoute('/settings/player')({
  component: PlayerPanel,
});
