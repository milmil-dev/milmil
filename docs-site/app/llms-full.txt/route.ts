import { getLLMText, getMarkdownPages } from '@/lib/source';
import { i18n } from '@/lib/i18n';

export const revalidate = false;

export async function GET() {
  // Pass the default language explicitly: with no argument this returns pages from every
  // locale, which would emit the same content four times over.
  const scan = getMarkdownPages(i18n.defaultLanguage).map(getLLMText);
  const scanned = await Promise.all(scan);

  return new Response(scanned.join('\n\n'));
}
