// web/src/components/DanmakuOverlay.tsx
import DanmakuEngine from 'danmaku';
import { useEffect, useRef } from 'react';
import type { DanmakuComment } from '@/lib/api/stream';
import { usePlayerStore } from '@/store/player-store';

interface DanmakuOverlayProps {
  videoElement: HTMLVideoElement | null;
  comments: DanmakuComment[];
}

export function DanmakuOverlay({ videoElement, comments }: DanmakuOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const danmakuRef = useRef<DanmakuEngine | null>(null);
  const enabled = usePlayerStore((s) => s.danmakuEnabled);
  const speed = usePlayerStore((s) => s.danmakuSpeed);

  // Init danmaku engine
  useEffect(() => {
    if (!videoElement || !containerRef.current || comments.length === 0) return;

    const engine = new DanmakuEngine({
      container: containerRef.current,
      media: videoElement,
      engine: 'canvas',
      comments: comments.map((c) => ({
        text: c.text,
        time: c.time,
        mode: c.mode,
        style: {
          fontSize: c.style.fontSize,
          color: c.style.color,
          opacity: String(c.style.opacity),
        },
      })),
      speed,
    });

    danmakuRef.current = engine;

    return () => {
      engine.destroy();
      danmakuRef.current = null;
    };
  }, [videoElement, comments, speed]);

  // Toggle visibility
  useEffect(() => {
    if (!danmakuRef.current) return;
    if (enabled) {
      danmakuRef.current.show();
    } else {
      danmakuRef.current.hide();
    }
  }, [enabled]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => danmakuRef.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <div ref={containerRef} className="absolute inset-0 pointer-events-none z-10" />;
}
