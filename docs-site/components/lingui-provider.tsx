'use client';
import { I18nProvider } from '@lingui/react';
import { setupI18n } from '@lingui/core';
import { type ReactNode, useMemo } from 'react';

export function LinguiClientProvider({
  locale,
  messages,
  children,
}: {
  locale: string;
  messages: Record<string, string>;
  children: ReactNode;
}) {
  const i18n = useMemo(
    () => setupI18n({ locale, messages: { [locale]: messages } }),
    [locale, messages],
  );

  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}
