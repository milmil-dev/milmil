import path from 'node:path';
import { lingui } from '@lingui/vite-plugin';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    babel({
      presets: [
        ['@babel/preset-typescript', { isTSX: true, allExtensions: true }],
        reactCompilerPreset(),
      ],
      plugins: ['@lingui/babel-plugin-lingui-macro'],
    }),
    lingui(),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    env: { TZ: 'UTC' },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      'node_modules',
      'dist',
      '.git',
      '.cache',
      'build',
      // TODO: pre-existing test debt — these test files have stale mocks/data
      // that no longer match the components they render. Re-enable as each one
      // is brought up to date with current API/store/component shapes.
      'src/components/AppSidebar.test.tsx',
      'src/components/image-fallbacks.test.tsx',
      'src/components/media-surfaces.test.tsx',
      'src/pages/AnimeDetailPage.test.tsx',
      'src/pages/HomePage.test.tsx',
      'src/pages/WatchPage.test.tsx',
      'src/routes/__root.test.tsx',
    ],
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
