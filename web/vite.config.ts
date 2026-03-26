import { lingui } from '@lingui/vite-plugin';
import babel from '@rolldown/plugin-babel';
import { serwist } from '@serwist/vite';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import packageJson from './package.json';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [
    tanstackRouter(), // MUST be before react()
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
    serwist({
      swSrc: 'src/sw.ts',
      swDest: 'sw.js',
      globDirectory: 'dist',
      injectionPoint: 'self.__SW_MANIFEST',
      rollupFormat: 'iife',
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    chunkSizeWarningLimit: 600,
  },
});
