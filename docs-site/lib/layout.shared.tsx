import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { getTranslations } from 'next-intl/server';
import { resolveLocale } from '@/i18n/locales';

const repoUrl = 'https://github.com/milmil-dev/milmil';

export async function baseOptions(locale: string): Promise<BaseLayoutProps> {
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'Nav' });

  return {
    i18n: true,
    githubUrl: repoUrl,
    nav: {
      title: (
        <span className="inline-flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG mark; next/image adds no value and breaks the inline nav layout */}
          <img src="/logo.svg" alt="milmil" className="h-6 w-6" />
          milmil
        </span>
      ),
      url: `/${locale}`,
    },
    links: [
      {
        text: t('docs'),
        url: `/${locale}/docs`,
        active: 'nested-url',
      },
      {
        text: t('github'),
        url: repoUrl,
        external: true,
      },
    ],
  };
}
