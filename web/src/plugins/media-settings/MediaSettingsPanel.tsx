import { motion } from 'motion/react';
import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import type { MediaSettingsPluginAPI } from './MediaSettingsPlugin';
import type { VideoFilterState } from './VideoFilter';

/* ─── Types ──────────────────────────────────────────────────────── */

interface MediaSettingsPanelProps {
  plugin: MediaSettingsPluginAPI | null;
  onClose: () => void;
}

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

function usePluginState(plugin: MediaSettingsPluginAPI) {
  const [, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return {
    filters: plugin.getFilterState(),
    volume: plugin.getVolume(),
    audioTracks: plugin.getAudioTracks(),
    refresh,
  };
}

/* ─── Main Component ─────────────────────────────────────────────── */

export function MediaSettingsPanel({ plugin, onClose }: MediaSettingsPanelProps) {
  if (!plugin) return null;

  return <MediaSettingsPanelInner plugin={plugin} onClose={onClose} />;
}

function MediaSettingsPanelInner({
  plugin,
  onClose,
}: {
  plugin: MediaSettingsPluginAPI;
  onClose: () => void;
}) {
  const state = usePluginState(plugin);

  const updateFilter = useCallback(
    <K extends keyof VideoFilterState>(key: K, value: VideoFilterState[K]) => {
      const setters: Record<keyof VideoFilterState, (v: number) => void> = {
        brightness: plugin.setBrightness,
        contrast: plugin.setContrast,
        saturation: plugin.setSaturation,
        warmth: plugin.setWarmth,
      };
      setters[key](value);
      state.refresh();
    },
    [plugin, state],
  );

  const resetFilters = useCallback(() => {
    plugin.resetFilters();
    state.refresh();
  }, [plugin, state]);

  const setVolume = useCallback(
    (v: number) => {
      plugin.setVolume(v);
      state.refresh();
    },
    [plugin, state],
  );

  const selectAudioTrack = useCallback(
    (index: number) => {
      plugin.setAudioTrack(index);
      state.refresh();
    },
    [plugin, state],
  );

  const hasNonDefaultFilters =
    state.filters.brightness !== 100 ||
    state.filters.contrast !== 100 ||
    state.filters.saturation !== 100 ||
    state.filters.warmth !== 0;

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
          <h3 className="text-sm font-medium text-white/80">Media Settings</h3>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white/70">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="p-3.5 space-y-3">
          {/* ── Video Filters ─────────────────────────────── */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <SectionLabel>Video Filters</SectionLabel>
              {hasNonDefaultFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="shrink-0 px-2 py-0.5 text-[10px] text-white/40 bg-white/[0.06]
                    rounded hover:bg-white/10 hover:text-white/60 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>

            <RangeSlider
              label="Brightness"
              value={state.filters.brightness}
              min={0}
              max={200}
              step={1}
              displayValue={`${state.filters.brightness}%`}
              onChange={(v) => updateFilter('brightness', v)}
            />

            <RangeSlider
              label="Contrast"
              value={state.filters.contrast}
              min={0}
              max={200}
              step={1}
              displayValue={`${state.filters.contrast}%`}
              onChange={(v) => updateFilter('contrast', v)}
            />

            <RangeSlider
              label="Saturation"
              value={state.filters.saturation}
              min={0}
              max={200}
              step={1}
              displayValue={`${state.filters.saturation}%`}
              onChange={(v) => updateFilter('saturation', v)}
            />

            <RangeSlider
              label="Warmth / Night Mode"
              value={state.filters.warmth}
              min={0}
              max={100}
              step={1}
              displayValue={`${state.filters.warmth}%`}
              onChange={(v) => updateFilter('warmth', v)}
            />
          </section>

          <Divider />

          {/* ── Audio ─────────────────────────────────────── */}
          <section className="space-y-2.5">
            <SectionLabel>Audio</SectionLabel>

            <RangeSlider
              label="Volume Boost"
              value={state.volume}
              min={0}
              max={200}
              step={1}
              displayValue={`${state.volume}%`}
              onChange={setVolume}
            />

            {/* Audio Track selector */}
            {state.audioTracks.length > 0 && (
              <div>
                <span className="text-[10px] text-white/40 block mb-1">Audio Track</span>
                <div className="space-y-1">
                  {state.audioTracks.map((track) => (
                    <button
                      key={track.index}
                      type="button"
                      onClick={() => selectAudioTrack(track.index)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[11px] transition-colors',
                        track.enabled
                          ? 'bg-white/10 text-white'
                          : 'text-white/50 hover:bg-white/[0.06] hover:text-white/70',
                      )}
                    >
                      <span className="flex-1 truncate">{track.label}</span>
                      {track.language && (
                        <span className="shrink-0 px-1.5 py-0.5 text-[8px] font-medium rounded bg-white/[0.08] text-white/40">
                          {track.language}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </motion.div>
    </>
  );
}
