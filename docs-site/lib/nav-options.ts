import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

const navLabels: Record<string, { docs: string; github: string }> = {
  en: { docs: 'Documentation', github: 'GitHub' },
  'zh-CN': { docs: '文档', github: 'GitHub' },
  'zh-TW': { docs: '文檔', github: 'GitHub' },
  'zh-HK': { docs: '文檔', github: 'GitHub' },
  ja: { docs: 'ドキュメント', github: 'GitHub' },
  ko: { docs: '문서', github: 'GitHub' },
};

export function baseOptions(locale: string): BaseLayoutProps {
  const labels = navLabels[locale] ?? navLabels.en;
  return {
    i18n: true,
    nav: {
      title: 'milmil',
      url: `/${locale}`,
    },
    links: [
      {
        text: labels.docs,
        url: `/${locale}/docs`,
        active: 'nested-url',
      },
      {
        text: labels.github,
        url: 'https://github.com/milmil-dev/milmil',
        external: true,
      },
    ],
  };
}
