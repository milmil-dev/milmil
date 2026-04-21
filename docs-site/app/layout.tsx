import './global.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | milmil',
    default: 'milmil - Self-hosted Anime Media Server',
  },
  description:
    'A self-hosted anime media server for managing, discovering, and streaming anime with danmaku, auto-downloads, and multi-provider metadata.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
