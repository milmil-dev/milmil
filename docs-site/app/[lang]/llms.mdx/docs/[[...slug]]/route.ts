import {
  getLLMText,
  getMarkdownPages,
  getPageMarkdownUrl,
  isOpenAPIPage,
  source,
} from '@/lib/source';
import { notFound } from 'next/navigation';

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lang: string; slug?: string[] }> },
) {
  const { lang, slug } = await params;
  // Drop the trailing `content.md` segment to recover the page slug.
  const page = source.getPage(slug?.slice(0, -1), lang);
  if (!page || isOpenAPIPage(page)) notFound();

  return new Response(await getLLMText(page), {
    headers: {
      'Content-Type': 'text/markdown',
    },
  });
}

export function generateStaticParams() {
  return getMarkdownPages().map((page) => ({
    lang: page.locale,
    slug: getPageMarkdownUrl(page).segments,
  }));
}
