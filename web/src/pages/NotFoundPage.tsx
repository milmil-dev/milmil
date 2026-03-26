import { Link } from '@tanstack/react-router';
import { PageTransition } from '../components/PageTransition';

export function NotFoundPage() {
  return (
    <PageTransition>
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <h1 className="text-6xl font-bold text-mm-text-muted mb-4">404</h1>
        <p className="text-lg text-mm-text-secondary mb-6">找不到此頁面</p>
        <Link to="/" className="text-sm font-medium text-mm-accent hover:underline">
          返回首頁
        </Link>
      </div>
    </PageTransition>
  );
}
