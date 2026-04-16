import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { source } from '@/lib/source';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

function baseOptions(locale: string): BaseLayoutProps {
  return {
    i18n: true,
    nav: {
      title: 'milmil',
      url: `/${locale}`,
    },
    links: [
      {
        text: 'Documentation',
        url: `/${locale}/docs`,
        active: 'nested-url',
      },
      {
        text: 'GitHub',
        url: 'https://github.com/milmil-dev/milmil',
        external: true,
      },
    ],
  };
}

export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;

  return (
    <DocsLayout {...baseOptions(lang)} tree={source.pageTree[lang]}>
      {children}
    </DocsLayout>
  );
}
