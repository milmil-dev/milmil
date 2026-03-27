import { createContext } from 'react';

export type Theme = 'dark';

export interface ThemeProviderState {
  theme: Theme;
  setTheme: () => void;
}

const initialState: ThemeProviderState = {
  theme: 'dark',
  setTheme: () => null,
};

export const ThemeProviderContext = createContext<ThemeProviderState>(initialState);
