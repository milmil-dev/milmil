import { createFileRoute } from '@tanstack/react-router';
import { SchedulePage } from '../pages/SchedulePage';

interface ScheduleSearch {
  year?: number;
  season?: string;
}

export const Route = createFileRoute('/schedule')({
  component: SchedulePage,
  validateSearch: (search: Record<string, unknown>): ScheduleSearch => ({
    year: typeof search.year === 'number' ? search.year : undefined,
    season: typeof search.season === 'string' ? search.season : undefined,
  }),
});
