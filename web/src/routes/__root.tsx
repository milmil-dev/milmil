import { useQueryClient } from '@tanstack/react-query';
import { createRootRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import { AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { AppSidebar } from '../components/AppSidebar';
import { CommandPalette } from '../components/CommandPalette';
import { SplashScreen } from '../components/SplashScreen';
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
    <div className="relative min-h-screen" style={{ backgroundColor: 'var(--mm-bg)' }}>
      {/* Background image — fixed, extends behind sidebar (Seanime pattern) */}
      {bgImage && (
        <div className="fixed top-0 z-0" style={{ height: 'clamp(400px, 55vh, 35rem)', left: 0, right: 0 }}>
          <img
            src={bgImage}
            alt=""
            className="w-full h-full object-cover object-center"
          />
          {/* Multi-layer gradients like Seanime */}
          {/* Top fade */}
          <div className="absolute top-0 left-0 right-0 h-[10rem] opacity-50" style={{ background: 'linear-gradient(to bottom, var(--mm-bg), transparent)' }} />
          {/* Bottom fade */}
          <div className="absolute bottom-0 left-0 right-0 h-[20rem]" style={{ background: 'linear-gradient(to top, var(--mm-bg), var(--mm-bg) 10%, transparent)' }} />
          {/* Left fade for sidebar area */}
          <div className="absolute inset-0 max-w-[10rem] opacity-70 hidden md:block" style={{ background: 'linear-gradient(to right, var(--mm-bg), transparent)' }} />
        </div>
      )}

      {/* Sidebar */}
      <AppSidebar />

      {/* Main content — pl-20 for 80px sidebar (Seanime slim sidebar) */}
      <main className="relative z-[5] min-h-screen md:pl-20 overflow-y-auto pb-16 md:pb-0">
        <AnimatePresence mode="wait">
          <Outlet key={pathname} />
        </AnimatePresence>
      </main>
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
  pendingComponent: SplashScreen,
  component: RootLayout,
});
