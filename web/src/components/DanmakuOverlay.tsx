import DanmakuEngine from 'danmaku';
import { useEffect, useRef } from 'react';
import type { DanmakuComment } from '@/lib/api/stream';
import { usePreferencesStore } from '@/store/preferences-store';

interface DanmakuOverlayProps {
  videoElement: HTMLVideoElement | null;
  comments: DanmakuComment[];
}

export function DanmakuOverlay({ videoElement, comments }: DanmakuOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const danmakuRef = useRef<DanmakuEngine | null>(null);

  // Read ALL settings directly from store (not from pre-baked comment styles)
  const enabled = usePreferencesStore((s) => s.danmakuEnabled);
  const speed = usePreferencesStore((s) => s.danmakuSpeed);
  const fontSize = usePreferencesStore((s) => s.danmakuFontSize);
  const opacity = usePreferencesStore((s) => s.danmakuOpacity);
  const area = usePreferencesStore((s) => s.danmakuArea);
  const bold = usePreferencesStore((s) => s.danmakuBold);
  const stroke = usePreferencesStore((s) => s.danmakuStroke);
  const fontFamily = usePreferencesStore((s) => s.danmakuFontFamily);
  const danmakuColor = usePreferencesStore((s) => s.danmakuColor);
  const filterScroll = usePreferencesStore((s) => s.danmakuFilterScroll);
  const filterTop = usePreferencesStore((s) => s.danmakuFilterTop);
  const filterBottom = usePreferencesStore((s) => s.danmakuFilterBottom);
  const antiSubtitle = usePreferencesStore((s) => s.danmakuAntiSubtitle);

  // Filter comments by type
  const filteredComments = comments.filter((c) => {
    if (c.mode === 'rtl' && !filterScroll) return false;
    if (c.mode === 'top' && !filterTop) return false;
    if (c.mode === 'bottom' && !filterBottom) return false;
    return true;
  });

  // Build CSS style for DOM rendering
  const buildStyle = (c: DanmakuComment): Partial<CSSStyleDeclaration> => {
    const color = danmakuColor !== '#FFFFFF' ? danmakuColor : c.style.color;
    const style: Partial<CSSStyleDeclaration> = {
      fontSize: `${fontSize}px`,
      fontFamily,
      color,
      opacity: String(opacity),
      textShadow:
        stroke === 'shadow'
          ? '1px 1px 2px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.5)'
          : stroke === 'stroke'
            ? '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
            : 'none',
    };

    if (bold) {
      style.fontWeight = 'bold';
    }

    return style;
  };

  // Init/reinit danmaku engine whenever ANY setting changes
  useEffect(() => {
    if (!videoElement || !containerRef.current || filteredComments.length === 0) return;

    const engine = new DanmakuEngine({
      container: containerRef.current,
      media: videoElement,
      engine: 'dom',
      comments: filteredComments.map((c) => ({
        text: c.text,
        time: c.time,
        mode: c.mode,
        style: buildStyle(c),
      })),
      speed,
    });

    danmakuRef.current = engine;

    return () => {
      engine.destroy();
      danmakuRef.current = null;
    };
  }, [videoElement, filteredComments, speed, fontSize, opacity, bold, stroke, fontFamily, danmakuColor]);

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

  const areaPercent = area * 100;
  const effectiveArea = antiSubtitle ? Math.min(areaPercent, 85) : areaPercent;

  return (
    <div
      ref={containerRef}
      className="absolute inset-x-0 top-0 pointer-events-none z-10"
      style={{ height: `${effectiveArea}%` }}
    />
  );
}
