import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';
import { i18n } from '@/lib/i18n';
import { siteUrl } from '@/lib/shared';

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const lang of i18n.languages) {
    entries.push({ url: `${siteUrl}/${lang}`, changeFrequency: 'weekly', priority: 1 });

    // Includes the generated API reference pages, which are part of the tree.
    for (const page of source.getPages(lang)) {
      entries.push({
        url: `${siteUrl}${page.url}`,
        changeFrequency: 'weekly',
        priority: page.slugs.length === 0 ? 0.9 : 0.7,
      });
    }
  }

  return entries;
}
