import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';

interface RailEntry {
  key: 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'earlier';
  visible: boolean;
}

interface HistoryTimelineRailProps {
  visibleBuckets: RailEntry[];
}

// Rail is w-28 (112px). Spine sits 16px from the right edge (x = 96).
const RAIL_WIDTH = 112;
const SPINE_X = RAIL_WIDTH - 16; // 96
// Dot is w-2.5 (10px) centered on the spine. pr = RAIL_WIDTH - SPINE_X - 5.
const ROW_PR = 11;

export function HistoryTimelineRail({ visibleBuckets }: HistoryTimelineRailProps) {
  const { i18n } = useLingui();
  const railRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: railRef,
    offset: ['start end', 'end start'],
  });
  const lightY = useTransform(scrollYProgress, [0, 1], ['-4%', '104%']);

  const labels: Record<RailEntry['key'], string> = {
    today: i18n._(msg`history.group.today`),
    yesterday: i18n._(msg`history.group.yesterday`),
    thisWeek: i18n._(msg`history.group.thisWeek`),
    lastWeek: i18n._(msg`history.group.lastWeek`),
    earlier: i18n._(msg`history.group.earlier`),
  };

  return (
    <aside ref={railRef} className="relative hidden w-28 shrink-0 md:block" aria-hidden="true">
      {/* Comet-tail spine — fades in at top, holds, fades out at bottom */}
      <div
        className="absolute pointer-events-none z-0"
        style={{
          left: SPINE_X,
          top: 0,
          bottom: 0,
          width: 1.5,
          marginLeft: -0.75,
          background:
            'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.16) 15%, rgba(255,255,255,0.16) 85%, transparent 100%)',
        }}
      />
      {/* Accent halo running alongside */}
      <div
        className="absolute pointer-events-none z-0"
        style={{
          left: SPINE_X,
          top: 0,
          bottom: 0,
          width: 8,
          marginLeft: -4,
          background:
            'linear-gradient(to bottom, transparent 0%, color-mix(in oklch, var(--mm-accent, #c8a0ff) 11%, transparent) 15%, color-mix(in oklch, var(--mm-accent, #c8a0ff) 11%, transparent) 85%, transparent 100%)',
          filter: 'blur(5px)',
        }}
      />

      {/* Scroll-linked flowing light — soft halo */}
      <motion.div
        className="absolute pointer-events-none z-[1]"
        style={{
          left: SPINE_X,
          top: lightY,
          width: 16,
          height: 80,
          marginLeft: -8,
          marginTop: -40,
          background:
            'radial-gradient(ellipse at center, color-mix(in oklch, var(--mm-accent, #c8a0ff) 55%, transparent) 0%, transparent 70%)',
          filter: 'blur(4px)',
          mixBlendMode: 'screen',
        }}
      />
      {/* Bright core */}
      <motion.div
        className="absolute pointer-events-none z-[1]"
        style={{
          left: SPINE_X,
          top: lightY,
          width: 3,
          height: 36,
          marginLeft: -1.5,
          marginTop: -18,
          background:
            'linear-gradient(to bottom, transparent 0%, color-mix(in oklch, var(--mm-accent, #c8a0ff) 85%, white) 50%, transparent 100%)',
          filter: 'blur(1px)',
          opacity: 0.9,
          mixBlendMode: 'screen',
        }}
      />

      {/* Bucket rows — label on the left, accent dot sits on the spine */}
      <div className="relative z-[2] flex flex-col gap-7 pt-28">
        {visibleBuckets
          .filter((b) => b.visible)
          .map((b, i) => (
            <div
              key={b.key}
              className="flex items-center justify-end gap-3 text-[14px] font-semibold text-ink/70"
              style={{ paddingRight: ROW_PR }}
            >
              <span>{labels[b.key]}</span>
              <div className="relative shrink-0">
                <div className="absolute -inset-1.5 rounded-full bg-mm-accent/20 blur-sm" />
                {i === 0 && (
                  <span className="absolute inset-0 rounded-full bg-mm-accent/40 animate-ping" />
                )}
                <div className="relative w-2.5 h-2.5 rounded-full bg-mm-accent ring-[1.5px] ring-mm-accent/30 ring-offset-1 ring-offset-mm-bg shadow-[0_0_6px_rgba(var(--mm-accent-rgb,200,160,255),0.4)]" />
              </div>
            </div>
          ))}
      </div>
    </aside>
  );
}
