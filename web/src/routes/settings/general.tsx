import { createFileRoute } from '@tanstack/react-router';
import { GeneralPanel } from '../../pages/settings/GeneralPanel';

export const Route = createFileRoute('/settings/general')({
  component: GeneralPanel,
});
