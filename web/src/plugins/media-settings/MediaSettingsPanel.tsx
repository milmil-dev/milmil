import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import type { MediaSettingsPluginAPI } from './MediaSettingsPlugin';
import type { VideoFilterState } from './VideoFilter';

/* ─── Types ──────────────────────────────────────────────────────── */

interface MediaSettingsPanelProps {
  plugin: MediaSettingsPluginAPI | null;
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

export function MediaSettingsPanel({ plugin }: MediaSettingsPanelProps) {
  const [open, setOpen] = useState(false);

  if (!plugin) return null;

  return <MediaSettingsPanelInner plugin={plugin} open={open} setOpen={setOpen} />;
}

function MediaSettingsPanelInner({
  plugin,
  open,
  setOpen,
}: {
  plugin: MediaSettingsPluginAPI;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
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
    <div className="relative">
      {/* Click-away backdrop */}
      {open && <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />}

      {/* Trigger button — equalizer icon */}
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          state.refresh();
        }}
        className="media-button media-button--subtle media-button--icon relative z-40"
        aria-label="Media settings"
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="media-icon"
          style={{ width: 18, height: 18 }}
        >
          <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" />
        </svg>
      </button>

      {/* Panel popover — opens upward from control bar */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 bottom-full z-40 mb-2 w-72 max-h-[70vh] overflow-y-auto
              rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl shadow-2xl
              scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
          >
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
        )}
      </AnimatePresence>
    </div>
  );
}
