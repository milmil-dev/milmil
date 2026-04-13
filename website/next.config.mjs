import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  experimental: {
    swcPlugins: [['@lingui/swc-plugin', {}]],
    turbopack: {
      root: '../../..',
    },
  },
};

export default withMDX(config);
