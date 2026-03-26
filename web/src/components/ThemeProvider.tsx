import { ThemeProviderContext } from '@/lib/theme-context';

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({
  children,
}: ThemeProviderProps) {
  const value = {
    theme: 'dark' as const,
    setTheme: () => {},
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}
