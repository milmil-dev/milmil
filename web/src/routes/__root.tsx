import { useQueryClient } from '@tanstack/react-query';
import { createRootRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppSidebar } from '../components/AppSidebar';
import { CommandPalette } from '../components/CommandPalette';
import { SplashScreen } from '../components/SplashScreen';
import { useWebSocket } from '../hooks/use-websocket';
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

  if (!src) return null;

  return (
    <div
      className={cn(
        'fixed top-0 z-0 h-[35rem] bg-[--mm-bg] transition-opacity duration-1000',
        dimmed && 'opacity-[0.05]',
      )}
      style={{ width: 'calc(100% + 5rem)', left: '-5rem' }}
    >
      {/* Bottom bleed — prevents hard edge below banner */}
      <div className="w-full z-[2] absolute -bottom-[10rem] h-[10rem]" style={{ background: 'linear-gradient(to bottom, var(--mm-bg), transparent)' }} />
      {/* Top fade */}
      <div className="w-full absolute z-[2] top-0 h-[10rem] opacity-50" style={{ background: 'linear-gradient(to bottom, var(--mm-bg), transparent)' }} />

      {/* The image */}
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
            className="w-full h-full object-cover object-center"
          />
        </motion.div>
      </AnimatePresence>

      {/* Left gradient — wide, for content readability */}
      <div
        className="hidden lg:block max-w-[80rem] w-full z-[2] h-full absolute left-0"
        style={{ background: 'linear-gradient(to right, var(--mm-bg) 5%, rgba(7,7,7,0.5) 5%, transparent)', opacity: 1 }}
      />
      {/* Right gradient */}
      <div
        className="hidden lg:block max-w-[60rem] w-full right-0 z-[2] h-full absolute opacity-90"
        style={{ background: 'linear-gradient(to left, var(--mm-bg) 5%, rgba(7,7,7,0.5) 5%, transparent)' }}
      />
      {/* Sidebar-edge gradient — darker near sidebar for icon readability */}
      <div
        className="hidden lg:block max-w-[10rem] w-full z-[2] h-full absolute left-0 opacity-70"
        style={{ background: 'linear-gradient(to right, var(--mm-bg), rgba(7,7,7,0.5) 5%, transparent)' }}
      />
      {/* Bottom gradient — strongest fade */}
      <div
        className="w-full z-[2] absolute bottom-0 h-[20rem]"
        style={{ background: 'linear-gradient(to top, var(--mm-bg), var(--mm-bg) 10%, transparent)' }}
      />
    </div>
  );
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
      {/* Banner image — Seanime pattern: fixed, h-[35rem], extends behind sidebar */}
      <BannerImage src={bgImage} />

      {/* Sidebar */}
      <AppSidebar />

      {/* Main content — pl-20 for 80px sidebar */}
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
