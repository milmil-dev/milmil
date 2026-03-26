import { createFileRoute } from '@tanstack/react-router';
import { PageTransition } from '../components/PageTransition';

export const Route = createFileRoute('/settings')({
  component: () => (
    <PageTransition>
      <div className="p-8 text-white">Settings coming soon.</div>
    </PageTransition>
  ),
});
