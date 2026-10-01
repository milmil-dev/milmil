import { expect, test } from 'vite-plus/test';

const catalogs = import.meta.glob<string>('../locales/*/messages.po', {
  query: '?raw',
  import: 'default',
  eager: true,
});

// Messages are written as ids (`msg\`settings.nav.backup\``), so the English
// catalog is the only place their text lives. An English msgstr that is empty
// or just repeats the id renders the raw key to every English user — Lingui
// treats "" as missing and falls back to the id.
const ID_STYLE = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+( \{\w+\})*$/;

function activeEntries(locale: string): Array<{ id: string; text: string }> {
  const po = catalogs[`../locales/${locale}/messages.po`];
  if (po === undefined) throw new Error(`no catalog for ${locale}`);
  return [...po.matchAll(/^msgid "(.*)"\nmsgstr "(.*)"$/gm)].map((m) => ({
    id: m[1]!,
    text: m[2]!,
  }));
}

test('every id-style English message has real text', () => {
  const broken = activeEntries('en')
    .filter(({ id }) => ID_STYLE.test(id))
    .filter(({ id, text }) => text === '' || text === id)
    .map(({ id }) => id);
  expect(broken).toEqual([]);
});

// A placeholder the English text doesn't have is one the caller never fills,
// so it renders literally ("已選取 {0} 項").
test('translations only use placeholders the English text uses', () => {
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
  const english = new Map(activeEntries('en').map(({ id, text }) => [id, text]));
  const offenders: string[] = [];
  for (const locale of ['zh-TW', 'zh-HK', 'zh-CN', 'ja', 'ko']) {
    for (const { id, text } of activeEntries(locale)) {
      if (!ID_STYLE.test(id) || text === '') continue;
      const allowed = new Set([...placeholders(id), ...placeholders(english.get(id) ?? '')]);
      if (placeholders(text).some((p) => !allowed.has(p))) offenders.push(`${locale}: ${id}`);
    }
  }
  expect(offenders).toEqual([]);
});
