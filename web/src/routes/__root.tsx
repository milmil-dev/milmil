import { createRootRoute, Outlet, redirect } from '@tanstack/react-router';
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

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    if (PUBLIC_ROUTES.includes(location.pathname)) return;

    const { token, user, initialized, setInitialized } = useAuthStore.getState();

    if (!token) {
      // Cache the status check — only fetch once per session
      let isInitialized = initialized;
      if (isInitialized === null) {
        const status = await api.get<StatusResponse>('/api/v1/auth/status');
        isInitialized = status.initialized;
        setInitialized(isInitialized);
      }
      if (!isInitialized) throw redirect({ to: '/setup' });
      throw redirect({ to: '/login' });
    }

    // Rehydrate user after page reload (token exists but user is null)
    if (!user) {
      try {
        const me = await api.get<UserResponse>('/api/v1/auth/me');
        useAuthStore.getState().login(token, me);
      } catch {
        // Token is invalid/expired — force re-login
        useAuthStore.getState().logout();
        throw redirect({ to: '/login' });
      }
    }
  },
  component: () => <Outlet />,
});
