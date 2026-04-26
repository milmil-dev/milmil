import type { LinguiConfig } from '@lingui/conf';

const config: LinguiConfig = {
  locales: ['en', 'zh-CN', 'zh-TW', 'zh-HK'],
  // No sourceLocale — all locales use msgstr (key-based msgids)
  catalogs: [
    {
      path: 'locales/{locale}/messages',
      include: ['app/**', 'components/**', 'lib/**'],
    },
  ],
};

export default config;
