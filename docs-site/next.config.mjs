import { createMDX } from 'fumadocs-mdx/next';
import createNextIntlPlugin from 'next-intl/plugin';

const withMDX = createMDX();
const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Pin the Turbopack root to this app. The repo has several sibling lockfiles
  // (web/, root), so inference picks the wrong directory.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default withNextIntl(withMDX(config));
