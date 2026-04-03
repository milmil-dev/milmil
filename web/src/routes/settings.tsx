import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '../pages/settings/SettingsPage';

export interface SettingsSearch {
  tab?: string;
}

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    tab: typeof search.tab === 'string' ? search.tab : undefined,
  }),
});
