import { createRootRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import { AnimatePresence } from 'motion/react';
import { AppSidebar } from '../components/AppSidebar';
import { api } from '../lib/api-client';
import { useAuthStore } from '../store/auth-store';

interface StatusResponse {
  initialized: boolean;
}

interface UserResponse {
  id: string;
  username: string;
}

const PUBLIC_ROUTES = ['/login', '/setup'];
const AUTH_BYPASS = import.meta.env.VITE_AUTH_BYPASS === 'true';

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  if (isPublic) {
    return <Outlet />;
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'oklch(7% 0.01 280)' }}>
      <AppSidebar />
      <main className="flex-1 ml-[240px] min-h-screen overflow-y-auto">
        <AnimatePresence mode="wait">
          <Outlet key={pathname} />
        </AnimatePresence>
      </main>
    </div>
  );
}

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    if (AUTH_BYPASS) return;
    if (PUBLIC_ROUTES.includes(location.pathname)) return;

    const { token, user, initialized, setInitialized } = useAuthStore.getState();

    if (!token) {
      let isInitialized = initialized;
      if (isInitialized === null) {
        const status = await api.get<StatusResponse>('/api/v1/auth/status');
        isInitialized = status.initialized;
        setInitialized(isInitialized);
      }
      if (!isInitialized) throw redirect({ to: '/setup' });
      throw redirect({ to: '/login' });
    }

    if (!user) {
      try {
        const me = await api.get<UserResponse>('/api/v1/auth/me');
        useAuthStore.getState().login(token, me);
      } catch {
        useAuthStore.getState().logout();
        throw redirect({ to: '/login' });
      }
    }
  },
  component: RootLayout,
});
