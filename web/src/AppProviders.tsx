import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './components/ThemeProvider';
import { Toaster } from './components/ui/sonner';
import { queryClient } from './lib/query-client';

/** Subscribe to i18n locale changes so the entire tree re-renders. */
function useLocale(): string {
  return useSyncExternalStore(
    (cb) => {
      const unsub = i18n.on('change', cb);
      return unsub;
    },
    () => i18n.locale
  );
}

interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const locale = useLocale();

  return (
    <I18nProvider i18n={i18n} key={locale}>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <ThemeProvider>
            {children}
            <Toaster position="bottom-right" />
          </ThemeProvider>
        </ErrorBoundary>
      </QueryClientProvider>
    </I18nProvider>
  );
}
