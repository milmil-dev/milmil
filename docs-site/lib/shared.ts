export const appName = 'milmil';

// Absolute origin for metadata routes (sitemap.xml, robots.txt, OG images, canonical URLs).
// Override per environment with NEXT_PUBLIC_SITE_URL; the default is the live origin so
// an unset variable can't silently publish localhost URLs to crawlers. milmil.dev was the
// default until 2026-08-27 — it was never registered, so every canonical URL pointed nowhere.
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://milmil.vercel.app';

export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

export const gitConfig = {
  user: 'milmil-dev',
  repo: 'milmil',
  branch: 'main',
};
