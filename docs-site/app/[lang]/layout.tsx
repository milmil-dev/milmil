import { RootProvider } from 'fumadocs-ui/provider/next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { i18nProvider } from 'fumadocs-ui/i18n';
import { translations } from '@/lib/translations';
import { resolveLocale } from '@/i18n/locales';
import { siteUrl } from '@/lib/shared';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  metadataBase: new URL(siteUrl),
};

export default async function LangLayout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;
  setRequestLocale(resolveLocale(lang));

  return (
    <html lang={lang} className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <NextIntlClientProvider>
          <RootProvider i18n={i18nProvider(translations, lang)}>{children}</RootProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
