import { useQueryClient } from '@tanstack/react-query';
import { createRootRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import { AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { AppSidebar } from '../components/AppSidebar';
import { CommandPalette } from '../components/CommandPalette';
import { TopNav } from '../components/TopNav';
import { useWebSocket } from '../hooks/use-websocket';
import { api } from '../lib/api-client';
import { useAuthStore } from '../store/auth-store';
import { useBgStore } from '../store/bg-store';

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

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bgImage = useBgStore((s) => s.image);
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
    return <Outlet />;
  }

  return (
    <div className="relative flex min-h-screen" style={{ backgroundColor: 'var(--mm-bg)' }}>
      {/* Full-screen background image — behind everything including sidebar */}
      {/* Background image — top area only with max height, fades into bg */}
      {bgImage && (
        <div
          className="fixed top-0 left-0 right-0 z-0"
          style={{ height: 'clamp(400px, 50vh, 600px)' }}
        >
          <img
            src={bgImage}
            alt=""
            className="w-full h-full object-cover object-center"
            style={{ filter: 'brightness(0.18) saturate(1.4)', transform: 'scale(1.02)' }}
          />
          {/* Hard fade to bg at bottom + left darken for sidebar readability */}
          <div
            className="absolute inset-0"
            style={{
              background: [
                'linear-gradient(to bottom, transparent 30%, var(--mm-bg) 100%)',
                'linear-gradient(to right, oklch(7% 0.01 260 / 0.7) 0%, transparent 40%)',
              ].join(', '),
            }}
          />
        </div>
      )}

      {/* Sidebar — sits on top of bg, transparent so bg shows through */}
      <AppSidebar />

      {/* Main content area */}
      <div className="relative z-[5] flex-1 md:ml-[200px] min-h-screen flex flex-col">
        <TopNav />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
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
