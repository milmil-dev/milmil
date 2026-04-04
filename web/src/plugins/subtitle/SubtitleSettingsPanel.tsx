import { motion } from 'motion/react';
import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import type { SubtitlePluginAPI } from './SubtitlePlugin';
import type { SubtitleStyleConfig, SubtitleTrack } from './types';

/* ─── Types ──────────────────────────────────────────────────────── */

interface SubtitleSettingsPanelProps {
  plugin: SubtitlePluginAPI;
  onClose: () => void;
}

/* ─── Constants ──────────────────────────────────────────────────── */

const PRESET_LABELS: Record<string, string> = {
  default: 'Default',
  cinema: 'Cinema',
  anime: 'Anime',
  highContrast: 'Hi-Con',
};

const SHADOW_TYPES: { value: SubtitleStyleConfig['shadowType']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'outline', label: 'Outline' },
  { value: 'drop-shadow', label: 'Shadow' },
  { value: 'raised', label: 'Raised' },
  { value: 'depressed', label: 'Depressed' },
];

const POSITIONS: { value: SubtitleStyleConfig['position']; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'center', label: 'Center' },
  { value: 'bottom', label: 'Bottom' },
];

const FONT_FAMILIES = [
  'Noto Sans CJK, sans-serif',
  'Arial, sans-serif',
  'Georgia, serif',
  'Courier New, monospace',
  'Trebuchet MS, sans-serif',
];

const FONT_FAMILY_LABELS: Record<string, string> = {
  'Noto Sans CJK, sans-serif': 'Noto Sans CJK',
  'Arial, sans-serif': 'Arial',
  'Georgia, serif': 'Georgia',
  'Courier New, monospace': 'Courier New',
  'Trebuchet MS, sans-serif': 'Trebuchet MS',
};

const TEXT_COLORS = [
  '#FFFFFF',
  '#FFE600',
  '#00FF00',
  '#00FFFF',
  '#FF6B6B',
  '#FF9500',
  '#C0C0C0',
];

const SOURCE_BADGE: Record<SubtitleTrack['source'], { label: string; className: string }> = {
  embedded: { label: 'EMB', className: 'bg-blue-500/20 text-blue-300' },
  external: { label: 'EXT', className: 'bg-green-500/20 text-green-300' },
  'drag-drop': { label: 'DROP', className: 'bg-amber-500/20 text-amber-300' },
  online: { label: 'WEB', className: 'bg-purple-500/20 text-purple-300' },
};

/* ─── Helpers ────────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[10px] font-medium uppercase tracking-wider text-white/40 mb-2">
      {children}
    </h4>
  );
}

function Divider() {
  return <div className="border-t border-white/[0.06]" />;
}

function ButtonGroup<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 py-1 text-[10px] font-medium rounded transition-colors',
            value === opt.value
              ? 'bg-white/15 text-white'
              : 'bg-white/[0.04] text-white/40 hover:text-white/60 hover:bg-white/[0.08]',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function RangeSlider({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-white/40">{label}</span>
        <span className="text-[10px] text-white/50 tabular-nums">
          {displayValue ?? value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 accent-white/70 bg-white/10 rounded-full appearance-none
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white/80
          [&::-webkit-slider-thumb]:cursor-pointer"
      />
    </label>
  );
}

/* ─── Hook: read plugin state ────────────────────────────────────── */

function usePluginState(plugin: SubtitlePluginAPI) {
  // Force re-render helper — we read plugin imperatively
  const [, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return {
    tracks: plugin.getTracks(),
    primaryTrack: plugin.getPrimaryTrack(),
    secondaryTrack: plugin.getSecondaryTrack(),
    presetName: plugin.getPresetName(),
    presetNames: plugin.getPresetNames(),
    delay: plugin.getDelay(),
    refresh,
  };
}

/* ─── Main Component ─────────────────────────────────────────────── */

export function SubtitleSettingsPanel({ plugin, onClose }: SubtitleSettingsPanelProps) {
  const state = usePluginState(plugin);

  // Style overrides — we track local state and push to plugin
  const [style, setStyle] = useState<Partial<SubtitleStyleConfig>>({});

  const updateStyle = useCallback(
    (patch: Partial<SubtitleStyleConfig>) => {
      setStyle((prev) => ({ ...prev, ...patch }));
      plugin.updateStyle(patch);
    },
    [plugin],
  );

  const selectPreset = useCallback(
    (name: string) => {
      plugin.setPreset(name);
      setStyle({}); // reset local overrides since preset reset them
      state.refresh();
    },
    [plugin, state],
  );

  const selectPrimary = useCallback(
    (index: number) => {
      plugin.setPrimary(index);
      state.refresh();
    },
    [plugin, state],
  );

  const selectSecondary = useCallback(
    (index: number) => {
      plugin.setSecondary(index);
      state.refresh();
    },
    [plugin, state],
  );

  const setDelay = useCallback(
    (seconds: number) => {
      plugin.setDelay(seconds);
      state.refresh();
    },
    [plugin, state],
  );

  return (
    <>
      {/* Click-away backdrop */}
      <div className="absolute inset-0 z-[100]" onClick={onClose} />

      {/* Slide-in panel from right */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="absolute top-0 right-0 bottom-0 z-[101] w-[280px]
          bg-black/80 backdrop-blur-xl border-l border-white/10
          overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <h3 className="text-sm font-medium text-white/80">Subtitles</h3>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white/70">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="p-3.5 space-y-3">
          {/* ── Track List ──────────────────────────────────── */}
          <section>
            <SectionLabel>Tracks</SectionLabel>
            {state.tracks.length === 0 ? (
              <p className="text-[11px] text-white/30 italic">No subtitles loaded</p>
            ) : (
              <div className="space-y-1">
                {/* "Off" option */}
                <button
                  type="button"
                  onClick={() => selectPrimary(-1)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[11px] transition-colors',
                    !state.primaryTrack
                      ? 'bg-white/10 text-white'
                      : 'text-white/50 hover:bg-white/[0.06] hover:text-white/70',
                  )}
                >
                  <span className="flex-1">Off</span>
                </button>

                {state.tracks.map((track, i) => {
                  const isPrimary = state.primaryTrack?.id === track.id;
                  const isSecondary = state.secondaryTrack?.id === track.id;
                  const badge = SOURCE_BADGE[track.source];

                  return (
                    <div key={track.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => selectPrimary(i)}
                        className={cn(
                          'flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[11px] transition-colors',
                          isPrimary
                            ? 'bg-white/10 text-white'
                            : 'text-white/50 hover:bg-white/[0.06] hover:text-white/70',
                        )}
                      >
                        <span className="flex-1 truncate">{track.label}</span>
                        <span
                          className={cn(
                            'shrink-0 px-1.5 py-0.5 text-[8px] font-medium rounded',
                            badge.className,
                          )}
                        >
                          {badge.label}
                        </span>
                        {isPrimary && (
                          <span className="shrink-0 text-[8px] text-white/30">P</span>
                        )}
                      </button>
                      {/* Secondary toggle */}
                      <button
                        type="button"
                        onClick={() => selectSecondary(isSecondary ? -1 : i)}
                        title={isSecondary ? 'Remove secondary' : 'Set as secondary'}
                        className={cn(
                          'shrink-0 w-6 h-6 flex items-center justify-center rounded text-[8px] font-medium transition-colors',
                          isSecondary
                            ? 'bg-white/15 text-white'
                            : 'text-white/20 hover:text-white/50 hover:bg-white/[0.06]',
                        )}
                      >
                        S
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <Divider />

          {/* ── Presets ─────────────────────────────────────── */}
          <section>
            <SectionLabel>Style Preset</SectionLabel>
            <ButtonGroup
              options={state.presetNames.map((name) => ({
                value: name,
                label: PRESET_LABELS[name] ?? name,
              }))}
              value={state.presetName}
              onChange={selectPreset}
            />
          </section>

          <Divider />

          {/* ── Style Controls ──────────────────────────────── */}
          <section className="space-y-2.5">
            <SectionLabel>Appearance</SectionLabel>

            {/* Font family */}
            <div>
              <span className="text-[10px] text-white/40 block mb-1">Font</span>
              <select
                value={style.fontFamily ?? ''}
                onChange={(e) => updateStyle({ fontFamily: e.target.value })}
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 py-1.5
                  text-[11px] text-white/80 appearance-none cursor-pointer
                  focus:outline-none focus:border-white/20"
              >
                <option value="" className="bg-neutral-900">
                  Preset default
                </option>
                {FONT_FAMILIES.map((f) => (
                  <option key={f} value={f} className="bg-neutral-900">
                    {FONT_FAMILY_LABELS[f] ?? f}
                  </option>
                ))}
              </select>
            </div>

            {/* Font size */}
            <RangeSlider
              label="Font Size"
              value={style.fontSize ?? 24}
              min={12}
              max={48}
              step={1}
              displayValue={`${style.fontSize ?? 24}px`}
              onChange={(v) => updateStyle({ fontSize: v })}
            />

            {/* Text color */}
            <div>
              <span className="text-[10px] text-white/40 block mb-1">Text Color</span>
              <div className="flex gap-1.5">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => updateStyle({ color: c })}
                    className={cn(
                      'w-5 h-5 rounded-full border-2 transition-all',
                      (style.color ?? '#FFFFFF') === c
                        ? 'border-white/60 scale-110'
                        : 'border-white/10 hover:border-white/30',
                    )}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>

            {/* Background opacity */}
            <RangeSlider
              label="Background Opacity"
              value={style.backgroundOpacity ?? 0.75}
              min={0}
              max={1}
              step={0.05}
              displayValue={`${Math.round((style.backgroundOpacity ?? 0.75) * 100)}%`}
              onChange={(v) => updateStyle({ backgroundOpacity: v })}
            />

            {/* Border style */}
            <div>
              <span className="text-[10px] text-white/40 block mb-1">Border Style</span>
              <ButtonGroup
                options={SHADOW_TYPES}
                value={style.shadowType ?? 'none'}
                onChange={(v) => updateStyle({ shadowType: v })}
              />
            </div>

            {/* Stroke width — only when shadow type is not none */}
            {(style.shadowType ?? 'none') !== 'none' && (
              <RangeSlider
                label="Stroke Width"
                value={style.strokeWidth ?? 2}
                min={0}
                max={6}
                step={0.5}
                displayValue={`${style.strokeWidth ?? 2}px`}
                onChange={(v) => updateStyle({ strokeWidth: v })}
              />
            )}

            {/* Position */}
            <div>
              <span className="text-[10px] text-white/40 block mb-1">Position</span>
              <ButtonGroup
                options={POSITIONS}
                value={style.position ?? 'bottom'}
                onChange={(v) => updateStyle({ position: v })}
              />
            </div>

            {/* Safe margin */}
            <RangeSlider
              label="Safe Margin"
              value={style.safeMargin ?? 5}
              min={0}
              max={20}
              step={1}
              displayValue={`${style.safeMargin ?? 5}%`}
              onChange={(v) => updateStyle({ safeMargin: v })}
            />
          </section>

          <Divider />

          {/* ── Timing ──────────────────────────────────────── */}
          <section className="space-y-2.5">
            <SectionLabel>Timing</SectionLabel>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <RangeSlider
                  label="Delay"
                  value={state.delay}
                  min={-10}
                  max={10}
                  step={0.1}
                  displayValue={`${state.delay >= 0 ? '+' : ''}${state.delay.toFixed(1)}s`}
                  onChange={setDelay}
                />
              </div>
              {state.delay !== 0 && (
                <button
                  type="button"
                  onClick={() => setDelay(0)}
                  className="shrink-0 px-2 py-1 text-[10px] text-white/40 bg-white/[0.06]
                    rounded hover:bg-white/10 hover:text-white/60 transition-colors mb-0.5"
                >
                  Reset
                </button>
              )}
            </div>
          </section>

          <Divider />

          {/* ── ASS Style Toggle ────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] text-white/70 block">Respect ASS Styles</span>
                <span className="text-[9px] text-white/30 block mt-0.5">
                  Use original positioning &amp; formatting
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateStyle({
                    respectAssStyle: !(style.respectAssStyle ?? true),
                  })
                }
                className={cn(
                  'relative w-8 h-[18px] rounded-full transition-colors',
                  (style.respectAssStyle ?? true)
                    ? 'bg-white/25'
                    : 'bg-white/[0.08]',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all',
                    (style.respectAssStyle ?? true) ? 'left-[15px]' : 'left-0.5',
                  )}
                />
              </button>
            </div>
          </section>
        </div>
      </motion.div>
    </>
  );
}
