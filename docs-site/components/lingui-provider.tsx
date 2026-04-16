'use client';
import { I18nProvider } from '@lingui/react';
import { type ReactNode, use } from 'react';
import { i18n } from '@lingui/core';

export function LinguiClientProvider({
  locale,
  messages,
  children,
}: {
  locale: string;
  messages: Record<string, string>;
  children: ReactNode;
}) {
  i18n.loadAndActivate({ locale, messages });

  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}
