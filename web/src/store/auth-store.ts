import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface User {
  id: string;
  username: string;
  /** Server-relative image URL, null/absent when the user has no avatar. */
  avatar_url?: string | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  initialized: boolean | null;
  login: (token: string, user: User) => void;
  /** Refresh the profile in place (avatar changes) without touching the token. */
  setUser: (user: User) => void;
  logout: () => void;
  setInitialized: (value: boolean) => void;
}

const TOKEN_KEY = 'milmil-token';

// Migrate: clear legacy JWT tokens (non-mlml_ prefix) from before API token migration
const storedToken = localStorage.getItem(TOKEN_KEY);
if (storedToken && !storedToken.startsWith('mlml_')) {
  localStorage.removeItem(TOKEN_KEY);
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set) => ({
      token: localStorage.getItem(TOKEN_KEY),
      user: null,
      initialized: null,

      login: (token, user) => {
        localStorage.setItem(TOKEN_KEY, token);
        set({ token, user, initialized: true }, false, 'auth/login');
      },

      setUser: (user) => {
        set({ user }, false, 'auth/setUser');
      },

      logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        set({ token: null, user: null }, false, 'auth/logout');
      },

      setInitialized: (value) => {
        set({ initialized: value }, false, 'auth/setInitialized');
      },
    }),
    { name: 'auth' }
  )
);
