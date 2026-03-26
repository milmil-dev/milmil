import { useQueryClient } from '@tanstack/react-query';
import { createRootRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import { AnimatePresence } from 'motion/react';
import { type ReactNode } from 'react';
import { toast } from 'sonner';
import { AppSidebar } from '../components/AppSidebar';
import { CommandPalette } from '../components/CommandPalette';
import { TopNav } from '../components/TopNav';
import { useWebSocket } from '../hooks/use-websocket';
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
  if (pathname.startsWith('/watch/')) return true;
  return false;
}

export function DesktopShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen overflow-x-hidden bg-mm-bg text-mm-text-primary">
      <AppSidebar />
      <div className="relative min-h-screen flex min-w-0 flex-1 flex-col lg:pl-[280px]">
        <TopNav />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4 sm:px-6 sm:pt-5 lg:px-8 lg:pb-8 lg:pt-6">
          <div className="mx-auto w-full max-w-[1840px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  useWebSocket((event) => {
    if (event.type === 'scan:completed') {
      toast.success(`掃描完成: ${event.data.library_name}`);
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
    }
    if (event.type === 'download:added') {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    }
  });

  if (pathname === '/login' || pathname === '/setup') {
    return (
      <>
        <Outlet />
        <CommandPalette />
      </>
    );
  }

  return (
    <>
      <DesktopShell>
        <AnimatePresence mode="wait">
          <Outlet key={pathname} />
        </AnimatePresence>
      </DesktopShell>
      <CommandPalette />
    </>
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
