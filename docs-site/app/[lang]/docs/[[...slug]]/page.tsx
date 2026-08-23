import { getPageImageUrl, getPageMarkdownUrl, isOpenAPIPage, source } from '@/lib/source';
import {
  DocsPage,
  DocsBody,
  DocsDescription,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getMDXComponents } from '@/components/mdx';
import { OpenAPIPage } from '@/components/api-page';
import { gitConfig } from '@/lib/shared';
import { localeAlternates } from '@/lib/metadata';
import { i18n } from '@/lib/i18n';

interface PageParams {
  lang: string;
  slug?: string[];
}

export default async function Page({ params }: { params: Promise<PageParams> }) {
  const { lang, slug } = await params;
  const page = source.getPage(slug, lang);
  if (!page) notFound();

  // Generated from the OpenAPI schema — no MDX body to render.
  if (isOpenAPIPage(page)) {
    return (
      <DocsPage toc={page.data.toc} full tableOfContent={{ style: 'clerk' }}>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        <DocsBody>
          <OpenAPIPage {...page.data.getOpenAPIPageProps()} />
        </DocsBody>
      </DocsPage>
    );
  }

  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full} tableOfContent={{ style: 'clerk' }}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/docs-site/content/docs/${page.path}`}
        />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // lets MDX link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  const page = source.getPage(slug, lang);
  if (!page) notFound();

  // `slug` is the same path segment in every locale, so the hreflang set is just the
  // same doc under each prefix.
  const docPath = `/docs${slug?.length ? `/${slug.join('/')}` : ''}`;

  // OG cards are generated for the default language only (see the og route), so every
  // locale points at the English card rather than a URL that was never rendered.
  const enPage = source.getPage(slug, i18n.defaultLanguage);

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: localeAlternates(lang, docPath),
    ...(enPage ? { openGraph: { images: getPageImageUrl(enPage).url } } : {}),
  };
}
