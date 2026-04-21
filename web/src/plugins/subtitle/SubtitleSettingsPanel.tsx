import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { SubtitlePluginAPI } from './SubtitlePlugin';
import type { SubtitleStyleConfig, SubtitleTrack } from './types';

/* ─── Types ──────────────────────────────────────────────────────── */

interface SubtitleSettingsPanelProps {
  plugin: SubtitlePluginAPI;
  onClose: () => void;
}

type PanelView = 'main' | 'tracks' | 'style' | 'timing';

/* ─── Constants ──────────────────────────────────────────────────── */

const PRESET_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'cinema', label: 'Cinema' },
  { value: 'anime', label: 'Anime' },
  { value: 'highContrast', label: 'High Contrast' },
];

const SHADOW_OPTIONS = [
  { value: 'none' as const, label: 'None' },
  { value: 'outline' as const, label: 'Outline' },
  { value: 'drop-shadow' as const, label: 'Drop Shadow' },
  { value: 'raised' as const, label: 'Raised' },
  { value: 'depressed' as const, label: 'Depressed' },
];

const POSITION_OPTIONS = [
  { value: 'top' as const, label: 'Top' },
  { value: 'center' as const, label: 'Center' },
  { value: 'bottom' as const, label: 'Bottom' },
];

const FONT_OPTIONS = [
  { value: '', label: 'Preset Default' },
  { value: 'Noto Sans CJK, sans-serif', label: 'Noto Sans CJK' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Courier New, monospace', label: 'Courier New' },
];

const FONT_SIZE_OPTIONS = [
  { value: 16, label: '16px' },
  { value: 20, label: '20px' },
  { value: 24, label: '24px (Default)' },
  { value: 28, label: '28px' },
  { value: 32, label: '32px' },
  { value: 36, label: '36px' },
  { value: 42, label: '42px' },
  { value: 48, label: '48px' },
];

const COLOR_OPTIONS = [
  { value: '#FFFFFF', label: 'White' },
  { value: '#FFE600', label: 'Yellow' },
  { value: '#00FF00', label: 'Green' },
  { value: '#00FFFF', label: 'Cyan' },
  { value: '#FF6B6B', label: 'Red' },
  { value: '#FF9500', label: 'Orange' },
];

const OPACITY_OPTIONS = [
  { value: 0, label: '0%' },
  { value: 0.25, label: '25%' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75% (Default)' },
  { value: 1, label: '100%' },
];

const SOURCE_BADGE: Record<SubtitleTrack['source'], string> = {
  embedded: 'EMB',
  external: 'EXT',
  'drag-drop': 'DROP',
  online: 'WEB',
};

/* ─── YouTube-style menu items ──────────────────────────────────── */

/** Row that navigates to a sub-menu */
function MenuRow({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[13px] text-white/90
        hover:bg-white/[0.08] transition-colors"
    >
      <span className="shrink-0 w-5 h-5 flex items-center justify-center text-white/60">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {value && <span className="shrink-0 text-white/50 text-[12px]">{value}</span>}
      <svg viewBox="0 0 24 24" fill="currentColor" className="shrink-0 w-4 h-4 text-white/30">
        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
      </svg>
    </button>
  );
}

/** Selectable option in a sub-menu */
function OptionRow({
  label,
  selected,
  onClick,
  colorSwatch,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  colorSwatch?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2.5 text-left text-[13px] transition-colors',
        selected ? 'text-white bg-white/[0.08]' : 'text-white/70 hover:bg-white/[0.06]'
      )}
    >
      <span className="shrink-0 w-5 h-5 flex items-center justify-center">
        {selected ? (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        ) : colorSwatch ? (
          <span
            className="w-4 h-4 rounded-full border border-white/20"
            style={{ backgroundColor: colorSwatch }}
          />
        ) : null}
      </span>
      <span className="flex-1">{label}</span>
    </button>
  );
}

/** Back header for sub-menus */
function SubMenuHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-[13px] text-white/90
        border-b border-white/[0.08] hover:bg-white/[0.06] transition-colors"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white/50">
        <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
      </svg>
      <span className="font-medium">{title}</span>
    </button>
  );
}

/* ─── Sub-view for style options (font, size, color, etc.) ────── */

type StyleSubView =
  | null
  | 'preset'
  | 'font'
  | 'fontSize'
  | 'color'
  | 'bgOpacity'
  | 'borderStyle'
  | 'position';

/* ─── Hook: read plugin state ────────────────────────────────────── */

function usePluginState(plugin: SubtitlePluginAPI) {
  const [, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return {
    tracks: plugin.getTracks(),
    primaryTrack: plugin.getPrimaryTrack(),
    secondaryTrack: plugin.getSecondaryTrack(),
    presetName: plugin.getPresetName(),
    delay: plugin.getDelay(),
    refresh,
  };
}

/* ─── Main Component ─────────────────────────────────────────────── */

export function SubtitleSettingsPanel({ plugin, onClose }: SubtitleSettingsPanelProps) {
  const state = usePluginState(plugin);
  const [view, setView] = useState<PanelView>('main');
  const [styleSubView, setStyleSubView] = useState<StyleSubView>(null);
  const [style, setStyle] = useState<Partial<SubtitleStyleConfig>>({});
  const directionRef = useRef(1); // 1 = forward (slide left), -1 = back (slide right)

  // Compute a unique key for AnimatePresence
  const viewKey = view === 'style' && styleSubView ? `style-${styleSubView}` : view;

  const updateStyle = useCallback(
    (patch: Partial<SubtitleStyleConfig>) => {
      setStyle((prev) => ({ ...prev, ...patch }));
      plugin.updateStyle(patch);
    },
    [plugin]
  );

  const selectPreset = useCallback(
    (name: string) => {
      plugin.setPreset(name);
      setStyle({});
      state.refresh();
    },
    [plugin, state]
  );

  const selectPrimary = useCallback(
    (index: number) => {
      plugin.setPrimary(index);
      state.refresh();
      setView('main');
    },
    [plugin, state]
  );

  const setDelay = useCallback(
    (seconds: number) => {
      plugin.setDelay(seconds);
      state.refresh();
    },
    [plugin, state]
  );

  // Resolve display values
  const currentTrackLabel = state.primaryTrack?.label ?? 'Off';
  const currentPresetLabel =
    PRESET_OPTIONS.find((p) => p.value === state.presetName)?.label ?? state.presetName;
  const currentFontLabel =
    FONT_OPTIONS.find((f) => f.value === (style.fontFamily ?? ''))?.label ?? 'Preset Default';
  const currentFontSize = style.fontSize ?? 24;
  const currentColor = style.color ?? '#FFFFFF';
  const currentColorLabel =
    COLOR_OPTIONS.find((c) => c.value === currentColor)?.label ?? currentColor;
  const currentBgOpacity = style.backgroundOpacity ?? 0.75;
  const currentBgLabel = `${Math.round(currentBgOpacity * 100)}%`;
  const currentShadow = style.shadowType ?? 'none';
  const currentShadowLabel = SHADOW_OPTIONS.find((s) => s.value === currentShadow)?.label ?? 'None';
  const currentPosition = style.position ?? 'bottom';
  const currentPositionLabel =
    POSITION_OPTIONS.find((p) => p.value === currentPosition)?.label ?? 'Bottom';
  const delayLabel = `${state.delay >= 0 ? '+' : ''}${state.delay.toFixed(1)}s`;

  /* ── Render sub-views ── */

  const renderContent = () => {
    // Style sub-views
    if (view === 'style' && styleSubView) {
      switch (styleSubView) {
        case 'preset':
          return (
            <>
              <SubMenuHeader title="Style Preset" onBack={() => navigateStyleBack()} />
              {PRESET_OPTIONS.map((opt) => (
                <OptionRow
                  key={opt.value}
                  label={opt.label}
                  selected={state.presetName === opt.value}
                  onClick={() => {
                    selectPreset(opt.value);
                    navigateStyleBack();
                  }}
                />
              ))}
            </>
          );
        case 'font':
          return (
            <>
              <SubMenuHeader title="Font" onBack={() => navigateStyleBack()} />
              {FONT_OPTIONS.map((opt) => (
                <OptionRow
                  key={opt.value}
                  label={opt.label}
                  selected={(style.fontFamily ?? '') === opt.value}
                  onClick={() => {
                    updateStyle({ fontFamily: opt.value || undefined });
                    navigateStyleBack();
                  }}
                />
              ))}
            </>
          );
        case 'fontSize':
          return (
            <>
              <SubMenuHeader title="Font Size" onBack={() => navigateStyleBack()} />
              {FONT_SIZE_OPTIONS.map((opt) => (
                <OptionRow
                  key={opt.value}
                  label={opt.label}
                  selected={currentFontSize === opt.value}
                  onClick={() => {
                    updateStyle({ fontSize: opt.value });
                    navigateStyleBack();
                  }}
                />
              ))}
            </>
          );
        case 'color':
          return (
            <>
              <SubMenuHeader title="Text Color" onBack={() => navigateStyleBack()} />
              {COLOR_OPTIONS.map((opt) => (
                <OptionRow
                  key={opt.value}
                  label={opt.label}
                  selected={currentColor === opt.value}
                  onClick={() => {
                    updateStyle({ color: opt.value });
                    navigateStyleBack();
                  }}
                  colorSwatch={opt.value}
                />
              ))}
            </>
          );
        case 'bgOpacity':
          return (
            <>
              <SubMenuHeader title="Background Opacity" onBack={() => navigateStyleBack()} />
              {OPACITY_OPTIONS.map((opt) => (
                <OptionRow
                  key={opt.value}
                  label={opt.label}
                  selected={currentBgOpacity === opt.value}
                  onClick={() => {
                    updateStyle({ backgroundOpacity: opt.value });
                    navigateStyleBack();
                  }}
                />
              ))}
            </>
          );
        case 'borderStyle':
          return (
            <>
              <SubMenuHeader title="Border Style" onBack={() => navigateStyleBack()} />
              {SHADOW_OPTIONS.map((opt) => (
                <OptionRow
                  key={opt.value}
                  label={opt.label}
                  selected={currentShadow === opt.value}
                  onClick={() => {
                    updateStyle({ shadowType: opt.value });
                    navigateStyleBack();
                  }}
                />
              ))}
            </>
          );
        case 'position':
          return (
            <>
              <SubMenuHeader title="Position" onBack={() => navigateStyleBack()} />
              {POSITION_OPTIONS.map((opt) => (
                <OptionRow
                  key={opt.value}
                  label={opt.label}
                  selected={currentPosition === opt.value}
                  onClick={() => {
                    updateStyle({ position: opt.value });
                    navigateStyleBack();
                  }}
                />
              ))}
            </>
          );
      }
    }

    // Style menu
    if (view === 'style') {
      return (
        <>
          <SubMenuHeader title="Subtitle Style" onBack={() => navigateBack('main')} />
          <MenuRow
            icon={<IconPalette />}
            label="Preset"
            value={currentPresetLabel}
            onClick={() => navigateStyleTo('preset')}
          />
          <MenuRow
            icon={<IconFont />}
            label="Font"
            value={currentFontLabel}
            onClick={() => navigateStyleTo('font')}
          />
          <MenuRow
            icon={<IconTextSize />}
            label="Font Size"
            value={`${currentFontSize}px`}
            onClick={() => navigateStyleTo('fontSize')}
          />
          <MenuRow
            icon={<IconColor />}
            label="Text Color"
            value={currentColorLabel}
            onClick={() => navigateStyleTo('color')}
          />
          <MenuRow
            icon={<IconOpacity />}
            label="Background"
            value={currentBgLabel}
            onClick={() => navigateStyleTo('bgOpacity')}
          />
          <MenuRow
            icon={<IconBorder />}
            label="Border Style"
            value={currentShadowLabel}
            onClick={() => navigateStyleTo('borderStyle')}
          />
          <MenuRow
            icon={<IconPosition />}
            label="Position"
            value={currentPositionLabel}
            onClick={() => navigateStyleTo('position')}
          />
          {/* ASS toggle */}
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className="shrink-0 w-5 h-5 flex items-center justify-center text-white/60">
              <IconAss />
            </span>
            <span className="flex-1 text-[13px] text-white/90">Respect ASS Styles</span>
            <button
              type="button"
              onClick={() => updateStyle({ respectAssStyle: !(style.respectAssStyle ?? true) })}
              className={cn(
                'relative w-9 h-5 rounded-full transition-colors',
                (style.respectAssStyle ?? true) ? 'bg-white/30' : 'bg-white/10'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  (style.respectAssStyle ?? true) ? 'translate-x-[18px]' : 'translate-x-0.5'
                )}
              />
            </button>
          </div>
        </>
      );
    }

    // Tracks sub-menu
    if (view === 'tracks') {
      return (
        <>
          <SubMenuHeader title="Subtitles" onBack={() => navigateBack('main')} />
          <OptionRow label="Off" selected={!state.primaryTrack} onClick={() => selectPrimary(-1)} />
          {state.tracks.map((track, i) => (
            <OptionRow
              key={track.id}
              label={`${track.label} (${SOURCE_BADGE[track.source]})`}
              selected={state.primaryTrack?.id === track.id}
              onClick={() => selectPrimary(i)}
            />
          ))}
        </>
      );
    }

    // Timing sub-menu
    if (view === 'timing') {
      return (
        <>
          <SubMenuHeader title="Subtitle Timing" onBack={() => navigateBack('main')} />
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-white/80">Delay</span>
              <span className="text-[13px] text-white/50 tabular-nums">{delayLabel}</span>
            </div>
            <input
              type="range"
              min={-10}
              max={10}
              step={0.1}
              value={state.delay}
              onChange={(e) => setDelay(Number(e.target.value))}
              className="w-full h-1 accent-white/70 bg-white/10 rounded-full appearance-none
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white/80
                [&::-webkit-slider-thumb]:cursor-pointer"
            />
            {state.delay !== 0 && (
              <button
                type="button"
                onClick={() => setDelay(0)}
                className="w-full py-2 text-[13px] text-white/60 hover:text-white/80 hover:bg-white/[0.06]
                  rounded transition-colors"
              >
                Reset to 0
              </button>
            )}
          </div>
        </>
      );
    }

    // Main menu (default)
    return (
      <>
        <MenuRow
          icon={<IconSubtitle />}
          label="Subtitles"
          value={currentTrackLabel}
          onClick={() => navigateTo('tracks')}
        />
        <MenuRow
          icon={<IconStyle />}
          label="Subtitle Style"
          value={currentPresetLabel}
          onClick={() => navigateTo('style')}
        />
        <MenuRow
          icon={<IconTimer />}
          label="Timing"
          value={delayLabel}
          onClick={() => navigateTo('timing')}
        />
      </>
    );
  };

  // Navigation helpers with direction tracking
  const navigateTo = (v: PanelView) => {
    directionRef.current = 1;
    setView(v);
  };
  const navigateBack = (v: PanelView) => {
    directionRef.current = -1;
    setView(v);
  };
  const navigateStyleTo = (v: StyleSubView) => {
    directionRef.current = 1;
    setStyleSubView(v);
  };
  const navigateStyleBack = () => {
    directionRef.current = -1;
    navigateStyleBack();
  };

  return (
    <>
      {/* Click-away backdrop */}
      <div className="absolute inset-0 z-[100]" onClick={onClose} />

      {/* YouTube-style panel — bottom-right of player */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="absolute right-3 bottom-14 z-[101] w-[280px] max-h-[70vh]
          rounded-xl bg-neutral-900/95 backdrop-blur-md overflow-hidden
          shadow-[0_0_20px_rgba(0,0,0,0.5)]"
      >
        <AnimatePresence mode="popLayout" initial={false} custom={directionRef.current}>
          <motion.div
            key={viewKey}
            custom={directionRef.current}
            initial={(d: number) => ({ x: `${(d as number) * 100}%`, opacity: 0 })}
            animate={{ x: 0, opacity: 1 }}
            exit={(d: number) => ({ x: `${(d as number) * -100}%`, opacity: 0 })}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-y-auto max-h-[70vh] py-1"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </>
  );
}

/* ─── Icons (simple SVG, YouTube style) ──────────────────────────── */

function IconSubtitle() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6v-2zm0 4h8v2H6v-2zm10 0h2v2h-2v-2zm-6-4h8v2h-8v-2z" />
    </svg>
  );
}

function IconStyle() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M2.53 19.65l1.34.56v-9.03l-2.43 5.86c-.41 1.02.08 2.19 1.09 2.61zm19.5-3.7L17.07 3.98a2.013 2.013 0 00-1.81-1.23c-.26 0-.53.04-.79.15L7.1 5.95a1.999 1.999 0 00-1.08 2.6l4.96 11.97a1.998 1.998 0 002.6 1.08l7.36-3.05a1.994 1.994 0 001.09-2.6z" />
    </svg>
  );
}

function IconTimer() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.962 8.962 0 0012 4c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
    </svg>
  );
}

function IconPalette() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
    </svg>
  );
}

function IconFont() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M9.93 13.5h4.14L12 7.98 9.93 13.5zM20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-4.05 16.5l-1.14-3H9.17l-1.12 3H5.96l5.11-13h1.86l5.11 13h-2.09z" />
    </svg>
  );
}

function IconTextSize() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M2 4v3h5v12h3V7h5V4H2zm19 5h-9v3h3v7h3v-7h3V9z" />
    </svg>
  );
}

function IconColor() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.2-.64-1.67-.08-.1-.13-.21-.13-.33 0-.28.22-.5.5-.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9z" />
    </svg>
  );
}

function IconOpacity() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M17.66 8L12 2.35 6.34 8A8.02 8.02 0 004 13.64c0 2 .78 4.11 2.34 5.67a7.99 7.99 0 0011.32 0c1.56-1.56 2.34-3.67 2.34-5.67S19.22 9.56 17.66 8zM6 14c.01-2 .62-3.27 1.76-4.4L12 5.27l4.24 4.38C17.38 10.77 17.99 12 18 14H6z" />
    </svg>
  );
}

function IconBorder() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M3 3v18h18V3H3zm16 16H5V5h14v14zM7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z" />
    </svg>
  );
}

function IconPosition() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M3 5h18v2H3V5zm0 4h18v2H3V9zm0 4h18v2H3v-2zm0 4h18v2H3v-2z" />
    </svg>
  );
}

function IconAss() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
    </svg>
  );
}
