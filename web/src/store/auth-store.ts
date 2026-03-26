import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface User {
  id: string;
  username: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  initialized: boolean | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  setInitialized: (value: boolean) => void;
}

const TOKEN_KEY = 'milmil-token';

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
