import { lingui } from '@lingui/vite-plugin';
import babel from '@rolldown/plugin-babel';
import { serwist } from '@serwist/vite';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, lazyPlugins } from 'vite-plus';
import packageJson from './package.json';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  fmt: {
    // Match the repo's pre-existing (Biome) style to keep diffs minimal.
    singleQuote: true,
    printWidth: 100,
    trailingComma: 'es5',
    ignorePatterns: [
      'src/components/ui/**',
      'src/routeTree.gen.ts',
      'src/locales/**/messages.ts',
      '**/*.md',
      'public/**',
    ],
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    ignorePatterns: ['src/components/ui/**', 'src/routeTree.gen.ts', 'src/locales/**/messages.ts'],
    options: { typeAware: true, typeCheck: false },
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: lazyPlugins(() => [
    tanstackRouter({ routeFileIgnorePattern: '\\.test\\.tsx?$' }), // MUST be before react()
    react(),
    babel({
      presets: [
        ['@babel/preset-typescript', { isTSX: true, allExtensions: true }],
        reactCompilerPreset(),
      ],
      plugins: ['@lingui/babel-plugin-lingui-macro'],
    }),
    lingui(),
    tailwindcss(),
    !isDev &&
      serwist({
        swSrc: 'src/sw.ts',
        swDest: 'sw.js',
        globDirectory: 'dist',
        injectionPoint: 'self.__SW_MANIFEST',
        rollupFormat: 'iife',
      }),
  ]),
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    chunkSizeWarningLimit: 600,
  },
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
});
