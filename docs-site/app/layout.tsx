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
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
