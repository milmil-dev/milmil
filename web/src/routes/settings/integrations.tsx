import { createFileRoute } from '@tanstack/react-router';
import { IntegrationsPanel } from '../../pages/settings/IntegrationsPanel';

export const Route = createFileRoute('/settings/integrations')({
  component: IntegrationsPanel,
});
