import { RootProvider } from 'fumadocs-ui/provider/next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { i18n as fdI18n } from '@/lib/i18n';
import { defineI18nUI } from 'fumadocs-ui/i18n';
import { LinguiClientProvider } from '@/components/lingui-provider';

const inter = Inter({ subsets: ['latin'] });

const { provider } = defineI18nUI(fdI18n, {
  translations: {
    en: { displayName: 'English' },
    'zh-CN': { displayName: '简体中文', search: '搜索文档' },
    'zh-TW': { displayName: '繁體中文', search: '搜尋文檔' },
    'zh-HK': { displayName: '粵語', search: '搜尋文檔' },
  },
});

const localeLoaders: Record<string, () => Promise<{ messages: any }>> = {
  en: () => import('@/locales/en/messages'),
  'zh-CN': () => import('@/locales/zh-CN/messages'),
  'zh-TW': () => import('@/locales/zh-TW/messages'),
  'zh-HK': () => import('@/locales/zh-HK/messages'),
};

export default async function LangLayout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;
  const { messages } = await (localeLoaders[lang] ?? localeLoaders.en)();

  return (
    <html lang={lang} className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider i18n={provider(lang)}>
          <LinguiClientProvider locale={lang} messages={messages}>
            {children}
          </LinguiClientProvider>
        </RootProvider>
      </body>
    </html>
  );
}
