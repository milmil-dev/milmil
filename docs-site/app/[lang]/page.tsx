import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { LandingPage } from '@/components/landing';
import { i18n } from '@/lib/i18n';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

function baseOptions(locale: string): BaseLayoutProps {
  return {
    i18n: true,
    nav: {
      title: 'milmil',
      url: `/${locale}`,
      transparentMode: 'top',
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

export default async function Home({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <HomeLayout {...baseOptions(lang)}>
      <LandingPage lang={lang} />
    </HomeLayout>
  );
}

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}
