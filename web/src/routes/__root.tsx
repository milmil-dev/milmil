import { createRootRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import { AnimatePresence } from 'motion/react';
import { AppSidebar } from '../components/AppSidebar';
import { CommandPalette } from '../components/CommandPalette';
import { TopNav } from '../components/TopNav';
import { api } from '../lib/api-client';
import { useAuthStore } from '../store/auth-store';

interface StatusResponse {
  initialized: boolean;
}
interface UserResponse {
  id: string;
  username: string;
}

const AUTH_BYPASS = import.meta.env.VITE_AUTH_BYPASS === 'true';

function isPublicRoute(pathname: string): boolean {
  const publicExact = ['/login', '/setup', '/schedule', '/trending', '/search'];
  if (publicExact.includes(pathname)) return true;
  if (pathname.startsWith('/anime/')) return true;
  return false;
}

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname === '/login' || pathname === '/setup') {
    return <Outlet />;
  }

  return (
    <div className="flex min-h-screen bg-mm-bg">
      <AppSidebar />
      <div className="flex-1 ml-[60px] min-h-screen flex flex-col">
        <TopNav />
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <Outlet key={pathname} />
          </AnimatePresence>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    if (AUTH_BYPASS) return;
    if (isPublicRoute(location.pathname)) return;

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
