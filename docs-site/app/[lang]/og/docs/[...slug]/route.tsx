import { getPageImageUrl, source } from '@/lib/source';
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { generate as DefaultImage } from 'fumadocs-ui/og';
import { appName } from '@/lib/shared';
import { i18n } from '@/lib/i18n';

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lang: string; slug: string[] }> },
) {
  const { lang, slug } = await params;
  const page = source.getPage(slug.slice(0, -1), lang);
  if (!page) notFound();

  return new ImageResponse(
    <DefaultImage title={page.data.title} description={page.data.description} site={appName} />,
    {
      width: 1200,
      height: 630,
    },
  );
}

/**
 * English only. `ImageResponse` renders through Satori, which embeds just the fonts it is
 * handed and ships none with CJK coverage — three of our four locales are Chinese, so every
 * other card would come out as tofu boxes. Pages in all locales point their `openGraph.image`
 * at the English card (see generateMetadata in the docs page), which is legible everywhere.
 * Restricting this also keeps the static build from rendering ~4x the images.
 */
export function generateStaticParams() {
  return source
    .getPages(i18n.defaultLanguage)
    .map((page) => ({ lang: page.locale, slug: getPageImageUrl(page).segments }));
}
