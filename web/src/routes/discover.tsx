import { createFileRoute, redirect } from '@tanstack/react-router';

/** Discover merged into Home — keep the path so bookmarks still resolve. */
export const Route = createFileRoute('/discover')({
  beforeLoad: () => {
    throw redirect({ to: '/' });
  },
});
