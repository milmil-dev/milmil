/**
 * Map various language identifiers (ISO 639-2/3 codes + common English
 * language names) to BCP 47 tags that Intl.DisplayNames understands.
 * Subtitle tracks often ship with human-readable `language` fields like
 * `"english"` or `"Chinese (Simplified)"` rather than ISO codes, so we
 * need to recognize those too.
 */
const LANG_ALIASES: Record<string, string> = {
  // 3-letter ISO 639-2/3
  eng: 'en',
  jpn: 'ja',
  kor: 'ko',
  chi: 'zh',
  zho: 'zh',
  tha: 'th',
  ind: 'id',
  fra: 'fr',
  fre: 'fr',
  deu: 'de',
  ger: 'de',
  spa: 'es',
  ita: 'it',
  rus: 'ru',
  por: 'pt',
  vie: 'vi',
  ara: 'ar',
  // English language names
  english: 'en',
  japanese: 'ja',
  korean: 'ko',
  chinese: 'zh',
  french: 'fr',
  german: 'de',
  spanish: 'es',
  italian: 'it',
  russian: 'ru',
  portuguese: 'pt',
  arabic: 'ar',
  thai: 'th',
  indonesian: 'id',
  vietnamese: 'vi',
  dutch: 'nl',
  polish: 'pl',
  turkish: 'tr',
  hebrew: 'he',
  hindi: 'hi',
  // Variants
  'chinese (simplified)': 'zh-Hans',
  'chinese (traditional)': 'zh-Hant',
  'simplified chinese': 'zh-Hans',
  'traditional chinese': 'zh-Hant',
  'portuguese (brazil)': 'pt-BR',
  'brazilian portuguese': 'pt-BR',
  'spanish (latin america)': 'es-419',
  'latin american spanish': 'es-419',
};

/** Suffixes the player should strip and display as a separate marker. */
const MODIFIER_RE = /\s*[[(](cc|forced|sdh|hearing impaired)[\])]\s*/i;

/**
 * Format a raw language identifier into a localized display name using
 * Intl.DisplayNames. Handles ISO codes (`chi`, `ja`), BCP 47 tags (`zh-CN`),
 * and English language names (`english`, `Chinese (Simplified)`).
 * Any `[CC]` / `[Forced]` / `[SDH]` suffix is preserved and appended.
 */
export function formatLanguage(code: string | null | undefined, uiLocale: string): string {
  if (!code) return '';
  const trimmed = code.trim();
  if (!trimmed) return '';

  // Strip and remember modifier suffix so we can re-append it.
  let modifier = '';
  const modMatch = trimmed.match(MODIFIER_RE);
  let stripped = trimmed;
  if (modMatch) {
    modifier = ` [${modMatch[1]!.toUpperCase()}]`;
    stripped = trimmed.replace(MODIFIER_RE, '').trim();
  }

  const normalized = LANG_ALIASES[stripped.toLowerCase()] ?? stripped;

  try {
    const dn = new Intl.DisplayNames([uiLocale], { type: 'language' });
    const name = dn.of(normalized);
    if (name && name !== normalized) return `${name}${modifier}`;
  } catch {
    /* fall through */
  }
  return `${stripped}${modifier}`;
}

/** Format a byte count as a human-readable string, e.g. `1.23 GB`. */
export function formatBytes(n: number): string {
  if (n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(2)} ${units[i]}`;
}
