import { useQueryClient } from '@tanstack/react-query';
import { createRootRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppSidebar } from '../components/AppSidebar';
import { CommandPalette } from '../components/CommandPalette';
import { SplashScreen } from '../components/SplashScreen';
import { useMillilWebSocket, useWSEvent } from '../hooks/use-websocket';
import { api } from '../lib/api-client';
import { cn } from '../lib/utils';
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

/**
 * BannerImage — Seanime-style fixed background banner.
 * - Fixed position, h-[35rem], extends 5rem behind sidebar
 * - Multi-layer gradient overlays (top, bottom, left, right, sidebar-edge)
 * - Scroll dimming: fades to opacity-5 when scrolled past 100px
 * - Transition overlay: bg-color fades in during image switches
 */
function BannerImage({ src }: { src: string | null }) {
  const [dimmed, setDimmed] = useState(false);

  useEffect(() => {
    const onScroll = () => setDimmed(window.scrollY > 100);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!src) {
    // Subtle ambient background when no image is set
    return (
      <div
        className={cn(
          'fixed top-0 z-0 h-[40rem] transition-opacity duration-1000',
          dimmed && 'opacity-[0.05]'
        )}
        style={{ left: 0, right: 0 }}
      >
        {/* Soft accent glow — top-right */}
        <div className="absolute -top-20 right-[10%] h-[400px] w-[500px] rounded-full bg-mm-accent/[0.03] blur-[120px]" />
        {/* Secondary warm glow — left */}
        <div className="absolute top-[10%] -left-20 h-[300px] w-[400px] rounded-full bg-mm-accent/[0.02] blur-[100px]" />
        {/* Subtle noise texture */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 30%, rgba(232,143,170,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(232,143,170,0.05) 0%, transparent 50%)',
          }}
        />
        {/* Bottom fade to mm-bg */}
        <div
          className="absolute bottom-0 w-full h-[15rem] z-[2]"
          style={{ background: 'linear-gradient(to top, var(--mm-bg), transparent)' }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'fixed top-0 z-0 h-[40rem] bg-[--mm-bg] transition-opacity duration-1000',
        dimmed && 'opacity-[0.05]'
      )}
      style={{ left: 0, right: 0 }}
    >
      {/* Bottom bleed — prevents hard edge below banner */}
      <div
        className="w-full z-[2] absolute -bottom-[5rem] h-[5rem]"
        style={{ background: 'linear-gradient(to bottom, var(--mm-bg), transparent)' }}
      />
      {/* Top fade — Seanime: h-[10rem] opacity-50 */}
      <div
        className="w-full absolute z-[2] top-0 h-[10rem] opacity-50"
        style={{ background: 'linear-gradient(to bottom, var(--mm-bg), transparent)' }}
      />

      {/* The image — z-[1] so gradients at z-[2] overlay it */}
      <AnimatePresence mode="wait">
        <motion.div
          key={src}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className="w-full h-full absolute z-[1] overflow-hidden"
        >
          <img
            src={src}
            alt=""
            className="w-full h-full object-cover object-center brightness-[0.6]"
          />
        </motion.div>
      </AnimatePresence>

      {/* Left gradient — Seanime: max-w-[80rem], from-5% via-bg via-opacity-50 */}
      <div
        className="hidden lg:block w-full z-[2] h-full absolute left-0"
        style={{
          maxWidth: '80rem',
          background:
            'linear-gradient(to right, var(--mm-bg) 0%, rgba(7,7,7,0.6) 15%, transparent 50%)',
        }}
      />
      {/* Right gradient — Seanime: max-w-[60rem], opacity-90 */}
      <div
        className="hidden lg:block w-full z-[2] h-full absolute right-0 opacity-90"
        style={{
          maxWidth: '60rem',
          background:
            'linear-gradient(to left, var(--mm-bg) 0%, rgba(7,7,7,0.6) 15%, transparent 50%)',
        }}
      />
      {/* Sidebar-edge gradient — Seanime: max-w-[10rem] opacity-70 */}
      <div
        className="hidden lg:block w-full z-[2] h-full absolute left-0 opacity-80"
        style={{
          maxWidth: '10rem',
          background: 'linear-gradient(to right, var(--mm-bg), transparent)',
        }}
      />
      {/* Bottom gradient — Seanime: h-[20rem] from-bg via-bg via-10% */}
      <div
        className="w-full z-[2] absolute bottom-0 h-[20rem]"
        style={{
          background: 'linear-gradient(to top, var(--mm-bg) 0%, var(--mm-bg) 10%, transparent)',
        }}
      />
    </div>
  );
}

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bgImage = useBgStore((s) => s.image);
  const queryClient = useQueryClient();
  // Connect WebSocket (routes scan events to Zustand store)
  useMillilWebSocket();

  // Handle specific WS events for toasts + query invalidation
  useWSEvent((event) => {
    if (event.type === 'scan:completed') {
      const libraryName =
        (event.data?.libraryName as string | undefined) ??
        (event.data?.library_name as string | undefined) ??
        '';
      toast.success(`掃描完成: ${libraryName}`);
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
      {/* Banner image — Seanime pattern: fixed, h-[35rem], extends behind sidebar */}
      <BannerImage src={bgImage} />

      {/* Sidebar */}
      <AppSidebar />

      {/* Main content — pl-20 for 80px sidebar */}
      <main className="relative z-[5] min-h-screen md:pl-20 overflow-y-auto pb-16 md:pb-0">
        <AnimatePresence mode="wait">
          <Outlet key={pathname.startsWith('/settings/') ? '/settings' : pathname} />
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
