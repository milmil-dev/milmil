import { createFileRoute } from '@tanstack/react-router';
import { AccountPanel } from '../../pages/settings/AccountPanel';

export const Route = createFileRoute('/settings/account')({
  component: AccountPanel,
});
