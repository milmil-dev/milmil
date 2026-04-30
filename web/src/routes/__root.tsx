import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createRootRoute,
  isRedirect,
  Outlet,
  redirect,
  useRouterState,
} from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppSidebar } from '../components/AppSidebar';
import { CommandPalette } from '../components/CommandPalette';
import { SplashScreen } from '../components/SplashScreen';
import { useMillilWebSocket, useWSEvent } from '../hooks/use-websocket';
import { setupApi } from '../lib/api/setup';
import { api } from '../lib/api-client';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/auth-store';
import { useBgStore } from '../store/bg-store';
import { useUpdateStore } from '../store/update-store';

interface StatusResponse {
  initialized: boolean;
}
interface UserResponse {
  id: string;
  username: string;
}

const AUTH_BYPASS = import.meta.env.VITE_AUTH_BYPASS === 'true';

function RootErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const { i18n } = useLingui();
  const isNetworkError = error.message === 'Failed to fetch' || error.name === 'TypeError';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-white/40"
        >
          {isNetworkError ? (
            <path
              d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d="M12 9v4m0 4h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </div>
      <div>
        <p className="text-[15px] font-medium text-white/70">
          {isNetworkError ? i18n._(msg`error.serverUnavailable`) : i18n._(msg`common.loadFailed`)}
        </p>
        {isNetworkError && (
          <p className="text-[13px] text-white/30 mt-1">
            {i18n._(msg`error.serverUnavailableHint`)}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] text-[13px] text-white/60 hover:text-white/80 transition-colors cursor-pointer"
        >
          {i18n._(msg`common.retry`)}
        </button>
      </div>
    </div>
  );
}

function isPublicRoute(pathname: string): boolean {
  const publicExact = ['/login', '/schedule', '/discover', '/search'];
  if (publicExact.includes(pathname)) return true;
  if (pathname === '/setup' || pathname.startsWith('/setup/')) return true;
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
function BannerImage({
  src,
  position,
  dimMode,
}: {
  src: string | null;
  position: 'top' | 'bottom';
  dimMode: 'scroll-down' | 'scroll-up';
}) {
  const [dimmed, setDimmed] = useState(dimMode === 'scroll-up');
  const isBottom = position === 'bottom';

  useEffect(() => {
    if (dimMode === 'scroll-up') {
      // Start dimmed, un-dim when scrolled near bottom
      setDimmed(true);
      const onScroll = () => {
        const distFromBottom =
          document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
        setDimmed(distFromBottom > 200);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }
    // Default: dim when scrolled past top
    const onScroll = () => setDimmed(window.scrollY > 100);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [dimMode]);

  if (!src) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed z-0 h-[40rem] bg-[--mm-bg] transition-opacity duration-1000',
        isBottom ? 'top-[55%] -translate-y-1/2' : 'top-0',
        dimmed && 'opacity-[0.05]'
      )}
      style={{ left: 0, right: 0 }}
    >
      {/* Edge bleed — prevents hard edge at the far end of banner */}
      <div
        className={cn(
          'w-full z-[2] absolute h-[5rem]',
          isBottom ? '-top-[5rem]' : '-bottom-[5rem]'
        )}
        style={{
          background: isBottom
            ? 'linear-gradient(to top, var(--mm-bg), transparent)'
            : 'linear-gradient(to bottom, var(--mm-bg), transparent)',
        }}
      />
      {/* Inner fade — soft transition at content-facing edge */}
      <div
        className={cn(
          'w-full absolute z-[2] h-[10rem] opacity-50',
          isBottom ? 'bottom-0' : 'top-0'
        )}
        style={{
          background: isBottom
            ? 'linear-gradient(to top, var(--mm-bg), transparent)'
            : 'linear-gradient(to bottom, var(--mm-bg), transparent)',
        }}
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
            style={
              isBottom
                ? {
                    maskImage:
                      'linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%), linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)',
                    maskComposite: 'intersect',
                    WebkitMaskImage:
                      'linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%), linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)',
                    WebkitMaskComposite: 'source-in',
                  }
                : undefined
            }
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
      {/* Content-facing gradient — gentle fade toward page content */}
      <div
        className={cn('w-full z-[2] absolute h-[8rem]', isBottom ? 'top-0' : 'bottom-0')}
        style={{
          background: isBottom
            ? 'linear-gradient(to bottom, var(--mm-bg), transparent)'
            : 'linear-gradient(to top, var(--mm-bg), transparent)',
        }}
      />
    </div>
  );
}

function RootLayout() {
  const { i18n } = useLingui();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bgImage = useBgStore((s) => s.image);
  const bgPosition = useBgStore((s) => s.position);
  const bgDimMode = useBgStore((s) => s.dimMode);
  const queryClient = useQueryClient();
  // Connect WebSocket (routes scan events to Zustand store)
  useMillilWebSocket();

  // Handle specific WS events for toasts + query invalidation
  useWSEvent((event) => {
    const libraryName =
      (event.data?.libraryName as string | undefined) ??
      (event.data?.library_name as string | undefined) ??
      '';
    if (event.type === 'scan:completed') {
      toast.success(`${i18n._(msg`scan.completed`)}: ${libraryName}`);
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
    }
    if (event.type === 'match:completed') {
      toast.success(`${i18n._(msg`match.completed`)}: ${libraryName}`);
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
      queryClient.invalidateQueries({ queryKey: ['collection'] });
    }
    if (event.type === 'download:added') {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    }
    if (event.type === 'notification:new') {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
    if (event.type === 'system:update-available') {
      useUpdateStore.getState().setLatest({
        latest: event.data?.latest as string,
        releaseUrl: (event.data?.release_url as string) ?? null,
        publishedAt: (event.data?.published_at as string) ?? null,
      });
    }
  });

  if (pathname === '/login' || pathname === '/setup' || pathname.startsWith('/setup/')) {
    return <Outlet />;
  }

  return (
    <div className="relative min-h-screen">
      {/* Banner image — Seanime pattern: fixed, h-[35rem], extends behind sidebar */}
      <BannerImage src={bgImage} position={bgPosition} dimMode={bgDimMode} />

      {/* Sidebar */}
      <AppSidebar />

      {/* Main content — pl-20 for 80px sidebar */}
      <main className="relative z-[5] min-h-screen md:pl-20 overflow-y-auto pb-16 md:pb-0">
        <Suspense fallback={<SplashScreen />}>
          <AnimatePresence mode="wait" initial={false}>
            <Outlet key={pathname} />
          </AnimatePresence>
        </Suspense>
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
        try {
          const status = await api.get<StatusResponse>('/api/v1/auth/status');
          isInitialized = status.initialized;
          setInitialized(isInitialized);
        } catch {
          // Server unreachable — let the page render with offline state
          return;
        }
      }
      if (!isInitialized) throw redirect({ to: '/setup' });
      throw redirect({ to: '/login' });
    }

    if (!user) {
      try {
        const me = await api.get<UserResponse>('/api/v1/auth/me');
        useAuthStore.getState().login(token, me);
      } catch {
        // Network error or invalid token — don't redirect, page will handle
      }
    }

    // Library-required gate: authed users hitting / with zero libraries
    // must finish setup. Skip if Tailscale-style AUTH_BYPASS is on, if
    // the path is /setup/*/login (already handled above), or if we're
    // not at the root.
    if (useAuthStore.getState().token && location.pathname === '/') {
      try {
        const status = await setupApi.getStatus();
        if (status.library_count === 0) {
          throw redirect({ to: '/setup/library' });
        }
      } catch (err) {
        if (isRedirect(err)) throw err; // re-throw redirect
        // Server error: fall through to render dashboard with whatever it gives.
      }
    }
  },
  pendingComponent: SplashScreen,
  errorComponent: RootErrorComponent,
  component: RootLayout,
});
