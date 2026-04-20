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
  const enabled = usePreferencesStore((s) => s.danmakuEnabled);
  const speed = usePreferencesStore((s) => s.danmakuSpeed);
  const area = usePreferencesStore((s) => s.danmakuArea);
  const bold = usePreferencesStore((s) => s.danmakuBold);
  const stroke = usePreferencesStore((s) => s.danmakuStroke);
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

  // Build canvas style based on stroke/bold settings
  const buildStyle = (c: DanmakuComment) => {
    const baseStyle: Record<string, string> = {
      fontSize: c.style.fontSize,
      color: c.style.color,
      opacity: String(c.style.opacity),
    };

    if (bold) {
      baseStyle.fontWeight = 'bold';
    }

    // Stroke/shadow effects for canvas mode
    if (stroke === 'shadow') {
      baseStyle.textShadow = '1px 1px 2px rgba(0,0,0,0.8), 0 0 1px rgba(0,0,0,0.5)';
      // Canvas equivalent
      (baseStyle as any).shadowColor = 'rgba(0,0,0,0.8)';
      (baseStyle as any).shadowBlur = '2';
    } else if (stroke === 'stroke') {
      baseStyle.textShadow = '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000';
      (baseStyle as any).shadowColor = '#000';
      (baseStyle as any).shadowBlur = '1';
    }

    return baseStyle;
  };

  // Init danmaku engine
  useEffect(() => {
    if (!videoElement || !containerRef.current || filteredComments.length === 0) return;

    const engine = new DanmakuEngine({
      container: containerRef.current,
      media: videoElement,
      engine: 'canvas',
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
  }, [videoElement, filteredComments, speed, bold, stroke]);

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

  // Calculate container height based on area and anti-subtitle settings
  const areaPercent = area * 100;
  // Anti-subtitle: if enabled, cap at 85% to leave room for subtitles at bottom
  const effectiveArea = antiSubtitle ? Math.min(areaPercent, 85) : areaPercent;

  return (
    <div
      ref={containerRef}
      className="absolute inset-x-0 top-0 pointer-events-none z-10"
      style={{ height: `${effectiveArea}%` }}
    />
  );
}
