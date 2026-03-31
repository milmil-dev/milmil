import { createFileRoute } from '@tanstack/react-router';
import { AboutPanel } from '../../pages/settings/AboutPanel';

export const Route = createFileRoute('/settings/about')({
  component: AboutPanel,
});
