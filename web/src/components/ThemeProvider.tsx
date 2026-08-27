import { useCallback, useEffect, useState } from 'react';
import { type ResolvedTheme, type Theme, ThemeProviderContext } from '@/lib/theme-context';

const STORAGE_KEY = 'milmil-theme';

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'system' || stored === 'dark' ? stored : 'dark';
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function resolve(theme: Theme): ResolvedTheme {
  return theme === 'system' ? systemTheme() : theme;
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolve(theme));

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  useEffect(() => {
    const resolved = resolve(theme);
    setResolvedTheme(resolved);
    applyTheme(resolved);

    if (theme !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      const next = systemTheme();
      setResolvedTheme(next);
      applyTheme(next);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [theme]);

  return (
    <ThemeProviderContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  );
}
