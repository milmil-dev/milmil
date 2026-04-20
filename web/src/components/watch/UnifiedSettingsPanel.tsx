import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatLanguage } from '@/lib/format';
import type { SubtitlePluginAPI } from '@/plugins/subtitle/SubtitlePlugin';
import type { SubtitleStyleConfig, SubtitleTrack } from '@/plugins/subtitle/types';
import type { MediaSettingsPluginAPI } from '@/plugins/media-settings/MediaSettingsPlugin';
import type { VideoFilterState } from '@/plugins/media-settings/VideoFilter';

/* ─── Types ──────────────────────────────────────────────────────── */

interface Props {
  subtitlePlugin: SubtitlePluginAPI | null;
  mediaPlugin: MediaSettingsPluginAPI | null;
  videoEl: HTMLVideoElement | null;
  onClose: () => void;
  /** Fires when primary subtitle changes. `track` is null when subtitles are turned off. */
  onSubtitleChange?: (track: SubtitleTrack | null) => void;
  /** Fires when audio track changes. `language` is the track's language code (may be empty). */
  onAudioChange?: (language: string) => void;
  /** Fires when subtitle delay changes. */
  onSubtitleDelayChange?: (seconds: number) => void;
}

type View =
  | 'main'
  // Subtitle views
  | 'subtitles' | 'subtitle-style' | 'sub-preset' | 'sub-font' | 'sub-fontSize'
  | 'sub-color' | 'sub-bgOpacity' | 'sub-border' | 'sub-position' | 'sub-timing'
  // Media views
  | 'speed' | 'brightness' | 'contrast' | 'saturation' | 'warmth' | 'volumeBoost' | 'audioTrack';

/** Parent view for each sub-view — drives the back button navigation. */
const VIEW_PARENT: Record<Exclude<View, 'main'>, View> = {
  subtitles: 'main',
  'subtitle-style': 'main',
  'sub-preset': 'subtitle-style',
  'sub-font': 'subtitle-style',
  'sub-fontSize': 'subtitle-style',
  'sub-color': 'subtitle-style',
  'sub-bgOpacity': 'subtitle-style',
  'sub-border': 'subtitle-style',
  'sub-position': 'subtitle-style',
  'sub-timing': 'main',
  speed: 'main',
  brightness: 'main',
  contrast: 'main',
  saturation: 'main',
  warmth: 'main',
  volumeBoost: 'main',
  audioTrack: 'main',
};

/* ─── Constants ──────────────────────────────────────────────────── */

const SIZE_OPTIONS = [16, 20, 24, 28, 32, 36, 42, 48];
const OPACITY_OPTIONS = [0, 0.25, 0.5, 0.75, 1];

function useSettingsLabels() {
  const { i18n } = useLingui();
  return {
    presets: [
      { value: 'default', label: i18n._(msg`settings.sub.preset.default`) },
      { value: 'cinema', label: i18n._(msg`settings.sub.preset.cinema`) },
      { value: 'anime', label: i18n._(msg`settings.sub.preset.anime`) },
      { value: 'highContrast', label: i18n._(msg`settings.sub.preset.highContrast`) },
    ],
    shadows: [
      { value: 'none' as const, label: i18n._(msg`settings.sub.shadow.none`) },
      { value: 'outline' as const, label: i18n._(msg`settings.sub.shadow.outline`) },
      { value: 'drop-shadow' as const, label: i18n._(msg`settings.sub.shadow.dropShadow`) },
      { value: 'raised' as const, label: i18n._(msg`settings.sub.shadow.raised`) },
      { value: 'depressed' as const, label: i18n._(msg`settings.sub.shadow.depressed`) },
    ],
    positions: [
      { value: 'top' as const, label: i18n._(msg`settings.sub.position.top`) },
      { value: 'center' as const, label: i18n._(msg`settings.sub.position.center`) },
      { value: 'bottom' as const, label: i18n._(msg`settings.sub.position.bottom`) },
    ],
    fonts: [
      { value: '', label: i18n._(msg`settings.sub.font.default`) },
      { value: 'Noto Sans CJK, sans-serif', label: 'Noto Sans CJK' },
      { value: 'Arial, sans-serif', label: 'Arial' },
      { value: 'Georgia, serif', label: 'Georgia' },
    ],
    colors: [
      { value: '#FFFFFF', label: i18n._(msg`settings.sub.color.white`) },
      { value: '#FFE600', label: i18n._(msg`settings.sub.color.yellow`) },
      { value: '#00FF00', label: i18n._(msg`settings.sub.color.green`) },
      { value: '#00FFFF', label: i18n._(msg`settings.sub.color.cyan`) },
      { value: '#FF6B6B', label: i18n._(msg`settings.sub.color.red`) },
    ],
  };
}
const SOURCE_BADGE: Record<SubtitleTrack['source'], string> = {
  embedded: 'EMB', external: 'EXT', 'drag-drop': 'DROP', online: 'WEB',
};

/* ─── Shared UI primitives ──────────────────────────────────────── */

function MenuRow({ icon, label, value, onClick }: {
  icon?: React.ReactNode; label: string; value?: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-2.5 mx-2 my-0.5 px-2.5 py-2 text-left text-xs
        rounded-lg text-white/90 hover:bg-white/[0.08] active:scale-[0.99] transition-all duration-100"
      style={{ width: 'calc(100% - 16px)' }}>
      {icon && <span className="shrink-0 w-4 h-4 text-white/50">{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {value && <span className="shrink-0 text-white/50 text-[11px]">{value}</span>}
      <svg viewBox="0 0 24 24" fill="currentColor" className="shrink-0 w-3.5 h-3.5 text-white/25">
        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
      </svg>
    </button>
  );
}

function OptionRow({ label, selected, onClick, swatch }: {
  label: React.ReactNode; selected: boolean; onClick: () => void; swatch?: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        'relative w-full flex items-center gap-2 mx-2 my-px px-2.5 py-1.5 text-left text-xs rounded-lg transition-colors duration-100',
        selected ? 'text-white bg-white/[0.08]' : 'text-white/65 hover:bg-white/[0.05] hover:text-white/90',
      )}
      style={{ width: 'calc(100% - 16px)' }}>
      {selected && (
        <span className="absolute left-0 top-1/2 h-3 w-[2px] -translate-y-1/2 rounded-r-sm bg-white" />
      )}
      <span className="shrink-0 w-4 h-4 flex items-center justify-center">
        {selected ? (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
        ) : swatch ? (
          <span className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: swatch }} />
        ) : null}
      </span>
      <span className="flex-1 min-w-0 flex items-center gap-1.5">{label}</span>
    </button>
  );
}

// Legacy BackHeader — now a no-op. The panel renders a single header outside
// the scroll area (see PanelHeader below) so sub-views can't bleed through.
function BackHeader(_props: { title: string; onBack: () => void }) {
  return null;
}

function PanelHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="shrink-0 shadow-[0_1px_0_rgba(255,255,255,0.06)]">
      <button
        type="button"
        onClick={onBack}
        className="group flex w-full items-center gap-2 px-3 py-2.5 text-left
          text-white/85 hover:text-white transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-white/50 group-hover:text-white/80 transition-colors">
          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
        </svg>
        <span className="truncate text-[13px] font-semibold tracking-[0.01em]">{title}</span>
      </button>
    </div>
  );
}

/**
 * Render a subtitle/audio track label with modifier markers as tinted chips.
 * Strips `[CC]` / `[FORCED]` / `[SDH]` suffix from the name, then renders them
 * as small chips beside the title.
 */
const MODIFIER_LABELS: Record<string, ReturnType<typeof msg>> = {
  CC: msg`settings.sub.badge.cc`,
  FORCED: msg`settings.sub.badge.forced`,
  SDH: msg`settings.sub.badge.sdh`,
};

function TrackLabel({ name }: { name: string }) {
  const { i18n } = useLingui();
  const match = name.match(/\s*\[(CC|FORCED|SDH)\]\s*$/i);
  const modifier = match?.[1]?.toUpperCase();
  const clean = modifier ? name.replace(/\s*\[(CC|FORCED|SDH)\]\s*$/i, '').trim() : name;
  return (
    <>
      <span className="truncate">{clean}</span>
      {modifier && (
        <span
          className="ml-auto shrink-0 rounded-sm bg-white/10 px-1.5 py-[1px]
            text-[9px] font-semibold tracking-wider text-white/70"
        >
          {MODIFIER_LABELS[modifier] ? i18n._(MODIFIER_LABELS[modifier]!) : modifier}
        </span>
      )}
    </>
  );
}

function Divider() {
  return <div className="border-t border-white/[0.06] mx-2 my-1" />;
}

function SliderControl({ label, value, min, max, step, display, defaultVal, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  display: string; defaultVal: number; onChange: (v: number) => void;
}) {
  return (
    <div className="px-4 py-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/50">{label}</span>
        <span className="text-[11px] text-white/60 tabular-nums">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 bg-white/15 rounded-full appearance-none
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
          [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110" />
      {value !== defaultVal && (
        <button type="button" onClick={() => onChange(defaultVal)}
          className="text-[11px] text-white/40 hover:text-white/60 transition-colors">
          Reset
        </button>
      )}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────── */

const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];

export function UnifiedSettingsPanel({
  subtitlePlugin,
  mediaPlugin,
  videoEl,
  onClose,
  onSubtitleChange,
  onAudioChange,
  onSubtitleDelayChange,
}: Props) {
  const { i18n } = useLingui();
  const [view, setView] = useState<View>('main');
  const [subStyle, setSubStyle] = useState<Partial<SubtitleStyleConfig>>({});
  const [, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const dirRef = useRef(1);

  const go = (v: View) => { dirRef.current = 1; setView(v); };
  const back = (v: View) => { dirRef.current = -1; setView(v); };

  const labels = useSettingsLabels();

  const updateSubStyle = useCallback((patch: Partial<SubtitleStyleConfig>) => {
    setSubStyle((prev) => ({ ...prev, ...patch }));
    subtitlePlugin?.updateStyle(patch);
  }, [subtitlePlugin]);

  // Subtitle state
  const subTracks = subtitlePlugin?.getTracks() ?? [];
  const subPrimary = subtitlePlugin?.getPrimaryTrack();
  const subPreset = subtitlePlugin?.getPresetName() ?? 'default';
  const subDelay = subtitlePlugin?.getDelay() ?? 0;
  const subTrackLabel = subPrimary?.label ?? i18n._(msg`settings.off`);
  const presetLabel = labels.presets.find((p) => p.value === subPreset)?.label ?? subPreset;

  // Media state
  const filters = mediaPlugin?.getFilterState() ?? { brightness: 100, contrast: 100, saturation: 100, warmth: 0 };
  const volume = mediaPlugin?.getVolume() ?? 100;
  const audioTracks = mediaPlugin?.getAudioTracks() ?? [];

  const updateFilter = useCallback((key: keyof VideoFilterState, v: number) => {
    const setters: Record<keyof VideoFilterState, ((v: number) => void) | undefined> = {
      brightness: mediaPlugin?.setBrightness, contrast: mediaPlugin?.setContrast,
      saturation: mediaPlugin?.setSaturation, warmth: mediaPlugin?.setWarmth,
    };
    setters[key]?.(v);
    refresh();
  }, [mediaPlugin, refresh]);

  const headerTitle = ((): string | null => {
    switch (view) {
      case 'main': return null;
      case 'subtitles': return i18n._(msg`settings.subtitles`);
      case 'subtitle-style': return i18n._(msg`settings.subtitleStyle`);
      case 'sub-preset': return i18n._(msg`settings.preset`);
      case 'sub-font': return i18n._(msg`settings.font`);
      case 'sub-fontSize': return i18n._(msg`settings.fontSize`);
      case 'sub-color': return i18n._(msg`settings.textColor`);
      case 'sub-bgOpacity': return i18n._(msg`settings.background`);
      case 'sub-border': return i18n._(msg`settings.borderStyle`);
      case 'sub-position': return i18n._(msg`settings.position`);
      case 'sub-timing': return i18n._(msg`settings.subtitleTiming`);
      case 'speed': return i18n._(msg`settings.playbackSpeed`);
      case 'brightness': return i18n._(msg`settings.brightness`);
      case 'contrast': return i18n._(msg`settings.contrast`);
      case 'saturation': return i18n._(msg`settings.saturation`);
      case 'warmth': return i18n._(msg`settings.nightMode`);
      case 'volumeBoost': return i18n._(msg`settings.volumeBoost`);
      case 'audioTrack': return i18n._(msg`settings.audioTrack`);
    }
  })();

  const renderContent = (): React.ReactNode => {
    switch (view) {
      // ── Subtitle sub-views ──
      case 'subtitles':
        return (<>
          <BackHeader title={i18n._(msg`settings.subtitles`)} onBack={() => back('main')} />
          <OptionRow label={i18n._(msg`settings.off`)} selected={!subPrimary}
            onClick={() => { subtitlePlugin?.setPrimary(-1); onSubtitleChange?.(null); refresh(); back('main'); }} />
          {(() => {
            // Only show source badge when tracks have mixed sources.
            const mixedSources = new Set(subTracks.map((t) => t.source)).size > 1;
            return subTracks.map((t, i) => {
              const name = formatLanguage(t.language, i18n.locale ?? 'en') || t.label;
              return (
                <OptionRow
                  key={t.id}
                  label={
                    <>
                      <TrackLabel name={name} />
                      {mixedSources && (
                        <span className="shrink-0 text-[9px] font-medium uppercase tracking-wider text-white/35">
                          {SOURCE_BADGE[t.source]}
                        </span>
                      )}
                    </>
                  }
                  selected={subPrimary?.id === t.id}
                  onClick={() => { subtitlePlugin?.setPrimary(i); onSubtitleChange?.(t); refresh(); back('main'); }}
                />
              );
            });
          })()}
        </>);

      case 'subtitle-style':
        return (<>
          <BackHeader title={i18n._(msg`settings.subtitleStyle`)} onBack={() => back('main')} />
          <MenuRow label={i18n._(msg`settings.preset`)} value={presetLabel} onClick={() => go('sub-preset')} />
          <MenuRow label={i18n._(msg`settings.font`)} value={labels.fonts.find(f => f.value === (subStyle.fontFamily ?? ''))?.label ?? i18n._(msg`settings.default`)} onClick={() => go('sub-font')} />
          <MenuRow label={i18n._(msg`settings.fontSize`)} value={`${subStyle.fontSize ?? 24}px`} onClick={() => go('sub-fontSize')} />
          <MenuRow label={i18n._(msg`settings.textColor`)} value={labels.colors.find(c => c.value === (subStyle.color ?? '#FFFFFF'))?.label} onClick={() => go('sub-color')} />
          <MenuRow label={i18n._(msg`settings.background`)} value={`${Math.round((subStyle.backgroundOpacity ?? 0.75) * 100)}%`} onClick={() => go('sub-bgOpacity')} />
          <MenuRow label={i18n._(msg`settings.border`)} value={labels.shadows.find(s => s.value === (subStyle.shadowType ?? 'none'))?.label} onClick={() => go('sub-border')} />
          <MenuRow label={i18n._(msg`settings.position`)} value={labels.positions.find(p => p.value === (subStyle.position ?? 'bottom'))?.label} onClick={() => go('sub-position')} />
          <Divider />
          <div className="flex items-center gap-2.5 mx-2 px-2.5 py-2">
            <span className="flex-1 text-xs text-white/70">{i18n._(msg`settings.respectAssStyles`)}</span>
            <button type="button" onClick={() => updateSubStyle({ respectAssStyle: !(subStyle.respectAssStyle ?? true) })}
              className={cn('relative w-9 h-5 rounded-full transition-colors',
                (subStyle.respectAssStyle ?? true) ? 'bg-white/30' : 'bg-white/10')}>
              <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                (subStyle.respectAssStyle ?? true) ? 'translate-x-[18px]' : 'translate-x-0.5')} />
            </button>
          </div>
        </>);

      case 'sub-preset':
        return (<>
          <BackHeader title={i18n._(msg`settings.preset`)} onBack={() => back('subtitle-style')} />
          {labels.presets.map(o => (
            <OptionRow key={o.value} label={o.label} selected={subPreset === o.value}
              onClick={() => { subtitlePlugin?.setPreset(o.value); setSubStyle({}); refresh(); back('subtitle-style'); }} />
          ))}
        </>);
      case 'sub-font':
        return (<>
          <BackHeader title={i18n._(msg`settings.font`)} onBack={() => back('subtitle-style')} />
          {labels.fonts.map(o => (
            <OptionRow key={o.value} label={o.label} selected={(subStyle.fontFamily ?? '') === o.value}
              onClick={() => { updateSubStyle({ fontFamily: o.value || undefined }); back('subtitle-style'); }} />
          ))}
        </>);
      case 'sub-fontSize':
        return (<>
          <BackHeader title={i18n._(msg`settings.fontSize`)} onBack={() => back('subtitle-style')} />
          {SIZE_OPTIONS.map(s => (
            <OptionRow key={s} label={`${s}px${s === 24 ? ' (Default)' : ''}`} selected={(subStyle.fontSize ?? 24) === s}
              onClick={() => { updateSubStyle({ fontSize: s }); back('subtitle-style'); }} />
          ))}
        </>);
      case 'sub-color':
        return (<>
          <BackHeader title={i18n._(msg`settings.textColor`)} onBack={() => back('subtitle-style')} />
          {labels.colors.map(o => (
            <OptionRow key={o.value} label={o.label} selected={(subStyle.color ?? '#FFFFFF') === o.value}
              swatch={o.value} onClick={() => { updateSubStyle({ color: o.value }); back('subtitle-style'); }} />
          ))}
        </>);
      case 'sub-bgOpacity':
        return (<>
          <BackHeader title={i18n._(msg`settings.background`)} onBack={() => back('subtitle-style')} />
          {OPACITY_OPTIONS.map(o => (
            <OptionRow key={o} label={`${Math.round(o * 100)}%${o === 0.75 ? ' (Default)' : ''}`}
              selected={(subStyle.backgroundOpacity ?? 0.75) === o}
              onClick={() => { updateSubStyle({ backgroundOpacity: o }); back('subtitle-style'); }} />
          ))}
        </>);
      case 'sub-border':
        return (<>
          <BackHeader title={i18n._(msg`settings.borderStyle`)} onBack={() => back('subtitle-style')} />
          {labels.shadows.map(o => (
            <OptionRow key={o.value} label={o.label} selected={(subStyle.shadowType ?? 'none') === o.value}
              onClick={() => { updateSubStyle({ shadowType: o.value }); back('subtitle-style'); }} />
          ))}
        </>);
      case 'sub-position':
        return (<>
          <BackHeader title={i18n._(msg`settings.position`)} onBack={() => back('subtitle-style')} />
          {labels.positions.map(o => (
            <OptionRow key={o.value} label={o.label} selected={(subStyle.position ?? 'bottom') === o.value}
              onClick={() => { updateSubStyle({ position: o.value }); back('subtitle-style'); }} />
          ))}
        </>);

      case 'sub-timing':
        return (<>
          <BackHeader title={i18n._(msg`settings.subtitleTiming`)} onBack={() => back('main')} />
          <SliderControl label="Delay" value={subDelay} min={-10} max={10} step={0.1}
            display={`${subDelay >= 0 ? '+' : ''}${subDelay.toFixed(1)}s`} defaultVal={0}
            onChange={(v) => { subtitlePlugin?.setDelay(v); onSubtitleDelayChange?.(v); refresh(); }} />
        </>);

      // ── Speed ──
      case 'speed': {
        const currentSpeed = videoEl?.playbackRate ?? 1;
        const setSpeed = (v: number) => { if (videoEl) videoEl.playbackRate = v; refresh(); };
        return (<>
          <BackHeader title={i18n._(msg`settings.playbackSpeed`)} onBack={() => back('main')} />
          <div className="px-3.5 py-3 space-y-4">
            {/* Current speed display */}
            <div className="text-center text-lg font-medium text-white/90 tabular-nums">
              {currentSpeed.toFixed(2)}x
            </div>
            {/* Slider with +/- buttons */}
            <div className="flex items-center gap-2.5">
              <button type="button" onClick={() => setSpeed(Math.max(0.25, currentSpeed - 0.25))}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.08] text-white/60 hover:bg-white/[0.12] active:scale-95 transition-all text-sm font-medium">
                −
              </button>
              <input type="range" min={0.25} max={4} step={0.25} value={currentSpeed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="flex-1 h-1 bg-white/15 rounded-full appearance-none
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                  [&::-webkit-slider-thumb]:cursor-pointer" />
              <button type="button" onClick={() => setSpeed(Math.min(4, currentSpeed + 0.25))}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.08] text-white/60 hover:bg-white/[0.12] active:scale-95 transition-all text-sm font-medium">
                +
              </button>
            </div>
            {/* Preset buttons */}
            <div className="flex gap-1.5 flex-wrap">
              {SPEED_PRESETS.map(s => (
                <button key={s} type="button" onClick={() => setSpeed(s)}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all active:scale-95',
                    Math.abs(currentSpeed - s) < 0.01
                      ? 'bg-white/[0.12] text-white'
                      : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.10]',
                  )}>
                  {s === 1 ? '1.0' : s.toString()}
                </button>
              ))}
            </div>
            {/* Normal label */}
            {Math.abs(currentSpeed - 1) < 0.01 && (
              <div className="text-center text-[10px] text-white/30">{i18n._(msg`settings.normal`)}</div>
            )}
          </div>
        </>);
      }

      // ── Media sub-views ──
      case 'brightness':
        return (<>
          <BackHeader title={i18n._(msg`settings.brightness`)} onBack={() => back('main')} />
          <SliderControl label={i18n._(msg`settings.brightness`)} value={filters.brightness} min={0} max={200} step={5}
            display={`${filters.brightness}%`} defaultVal={100} onChange={(v) => updateFilter('brightness', v)} />
        </>);
      case 'contrast':
        return (<>
          <BackHeader title={i18n._(msg`settings.contrast`)} onBack={() => back('main')} />
          <SliderControl label={i18n._(msg`settings.contrast`)} value={filters.contrast} min={0} max={200} step={5}
            display={`${filters.contrast}%`} defaultVal={100} onChange={(v) => updateFilter('contrast', v)} />
        </>);
      case 'saturation':
        return (<>
          <BackHeader title={i18n._(msg`settings.saturation`)} onBack={() => back('main')} />
          <SliderControl label={i18n._(msg`settings.saturation`)} value={filters.saturation} min={0} max={200} step={5}
            display={`${filters.saturation}%`} defaultVal={100} onChange={(v) => updateFilter('saturation', v)} />
        </>);
      case 'warmth':
        return (<>
          <BackHeader title={i18n._(msg`settings.nightMode`)} onBack={() => back('main')} />
          <SliderControl label="Warmth" value={filters.warmth} min={0} max={100} step={5}
            display={`${filters.warmth}%`} defaultVal={0} onChange={(v) => updateFilter('warmth', v)} />
        </>);
      case 'volumeBoost':
        return (<>
          <BackHeader title={i18n._(msg`settings.volumeBoost`)} onBack={() => back('main')} />
          <SliderControl label="Volume" value={volume} min={0} max={200} step={5}
            display={`${volume}%`} defaultVal={100}
            onChange={(v) => { mediaPlugin?.setVolume(v); refresh(); }} />
        </>);
      case 'audioTrack':
        return (<>
          <BackHeader title={i18n._(msg`settings.audioTrack`)} onBack={() => back('main')} />
          {audioTracks.map(t => {
            const name = formatLanguage(t.language, i18n.locale ?? 'en') || t.label || t.language;
            return (
              <OptionRow key={t.index} label={name}
                selected={t.enabled}
                onClick={() => { mediaPlugin?.setAudioTrack(t.index); onAudioChange?.(t.language ?? ''); refresh(); back('main'); }} />
            );
          })}
        </>);

      // ── Main ──
      default:
        return (<>
          {/* Subtitle section */}
          {subtitlePlugin && (
            <>
              <MenuRow icon={<IconSub />} label={i18n._(msg`settings.subtitles`)} value={subTrackLabel} onClick={() => go('subtitles')} />
              <MenuRow icon={<IconStyle />} label={i18n._(msg`settings.subtitleStyle`)} value={presetLabel} onClick={() => go('subtitle-style')} />
              <MenuRow icon={<IconTimer />} label={i18n._(msg`settings.subtitleTiming`)}
                value={subDelay !== 0 ? `${subDelay >= 0 ? '+' : ''}${subDelay.toFixed(1)}s` : undefined}
                onClick={() => go('sub-timing')} />
            </>
          )}
          <Divider />
          {/* Playback speed */}
          <MenuRow icon={<IconSpeed />} label={i18n._(msg`settings.playbackSpeed`)}
            value={videoEl && videoEl.playbackRate !== 1 ? `${videoEl.playbackRate}x` : i18n._(msg`settings.normal`)}
            onClick={() => go('speed')} />
          {mediaPlugin && <Divider />}
          {/* Media section */}
          {mediaPlugin && (
            <>
              <MenuRow icon={<IconBrightness />} label={i18n._(msg`settings.brightness`)}
                value={filters.brightness !== 100 ? `${filters.brightness}%` : undefined} onClick={() => go('brightness')} />
              <MenuRow icon={<IconContrast />} label={i18n._(msg`settings.contrast`)}
                value={filters.contrast !== 100 ? `${filters.contrast}%` : undefined} onClick={() => go('contrast')} />
              <MenuRow icon={<IconSaturation />} label={i18n._(msg`settings.saturation`)}
                value={filters.saturation !== 100 ? `${filters.saturation}%` : undefined} onClick={() => go('saturation')} />
              <MenuRow icon={<IconNight />} label={i18n._(msg`settings.nightMode`)}
                value={filters.warmth > 0 ? `${filters.warmth}%` : undefined} onClick={() => go('warmth')} />
              <Divider />
              <MenuRow icon={<IconVolume />} label={i18n._(msg`settings.volumeBoost`)}
                value={volume !== 100 ? `${volume}%` : undefined} onClick={() => go('volumeBoost')} />
              {audioTracks.length > 1 && (
                <MenuRow icon={<IconAudio />} label={i18n._(msg`settings.audioTrack`)}
                  value={(() => {
                    const cur = audioTracks.find(t => t.enabled);
                    if (!cur) return undefined;
                    return formatLanguage(cur.language, i18n.locale ?? 'en') || cur.label || cur.language;
                  })()}
                  onClick={() => go('audioTrack')} />
              )}
            </>
          )}
        </>);
    }
  };

  const viewKey = view;

  return (
    <>
      <div className="absolute inset-0 z-[100]" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
        data-settings-panel
        className="absolute right-2 bottom-12 z-[101] w-[260px] max-h-[20rem] flex flex-col
          rounded-2xl bg-[rgba(40,40,40,0.55)] backdrop-blur-[40px] backdrop-saturate-[1.8]
          border border-white/[0.12]
          shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_0.5px_0_rgba(255,255,255,0.08)] overflow-hidden"
      >
        {headerTitle && (
          <PanelHeader title={headerTitle} onBack={() => back(VIEW_PARENT[view as Exclude<View, 'main'>])} />
        )}
        <AnimatePresence mode="popLayout" initial={false} custom={dirRef.current}>
          <motion.div
            key={viewKey}
            custom={dirRef.current}
            initial={(d: number) => ({ x: `${d * 80}%`, opacity: 0 })}
            animate={{ x: 0, opacity: 1 }}
            exit={(d: number) => ({ x: `${d * -80}%`, opacity: 0 })}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="flex-1 min-h-0 overflow-y-auto py-1"
            style={
              {
                ['--scrollbar-size' as never]: '6px',
                ['--scrollbar-thumb' as never]: 'rgba(255,255,255,0.12)',
                ['--scrollbar-thumb-hover' as never]: 'rgba(255,255,255,0.22)',
              } as React.CSSProperties
            }
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </>
  );
}

/* ─── Icons (4×4 simple SVGs) ────────────────────────────────────── */

const ic = 'w-4 h-4';
function IconSub() { return <svg viewBox="0 0 24 24" fill="currentColor" className={ic}><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h8v2H6zm10 0h2v2h-2zm-6-4h8v2h-8z"/></svg>; }
function IconStyle() { return <svg viewBox="0 0 24 24" fill="currentColor" className={ic}><path d="M2.53 19.65l1.34.56v-9.03l-2.43 5.86c-.41 1.02.08 2.19 1.09 2.61zm19.5-3.7L17.07 3.98a2.013 2.013 0 00-1.81-1.23c-.26 0-.53.04-.79.15L7.1 5.95a1.999 1.999 0 00-1.08 2.6l4.96 11.97a1.998 1.998 0 002.6 1.08l7.36-3.05a1.994 1.994 0 001.09-2.6z"/></svg>; }
function IconTimer() { return <svg viewBox="0 0 24 24" fill="currentColor" className={ic}><path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.962 8.962 0 0012 4c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>; }
function IconBrightness() { return <svg viewBox="0 0 24 24" fill="currentColor" className={ic}><path d="M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z"/></svg>; }
function IconContrast() { return <svg viewBox="0 0 24 24" fill="currentColor" className={ic}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93s3.05-7.44 7-7.93v15.86z"/></svg>; }
function IconSaturation() { return <svg viewBox="0 0 24 24" fill="currentColor" className={ic}><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>; }
function IconNight() { return <svg viewBox="0 0 24 24" fill="currentColor" className={ic}><path d="M9 2c-1.05 0-2.05.16-3 .46 4.06 1.27 7 5.06 7 9.54 0 4.48-2.94 8.27-7 9.54.95.3 1.95.46 3 .46 5.52 0 10-4.48 10-10S14.52 2 9 2z"/></svg>; }
function IconVolume() { return <svg viewBox="0 0 24 24" fill="currentColor" className={ic}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>; }
function IconAudio() { return <svg viewBox="0 0 24 24" fill="currentColor" className={ic}><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>; }
function IconSpeed() { return <svg viewBox="0 0 24 24" fill="currentColor" className={ic}><path d="M20.38 8.57l-1.23 1.85a8 8 0 01-.22 7.58H5.07A8 8 0 0115.58 6.85l1.85-1.23A10 10 0 003.35 19a2 2 0 001.72 1h13.85a2 2 0 001.74-1 10 10 0 00-.27-10.44zm-9.79 6.84a2 2 0 002.83 0l5.66-8.49-8.49 5.66a2 2 0 000 2.83z"/></svg>; }
