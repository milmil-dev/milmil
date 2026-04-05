import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { MediaSettingsPluginAPI } from './MediaSettingsPlugin';
import type { VideoFilterState } from './VideoFilter';

/* ─── Types ──────────────────────────────────────────────────────── */

interface MediaSettingsPanelProps {
  plugin: MediaSettingsPluginAPI | null;
  onClose: () => void;
}

type PanelView = 'main' | 'brightness' | 'contrast' | 'saturation' | 'warmth' | 'volumeBoost' | 'audioTrack';

/* ─── YouTube-style menu items ──────────────────────────────────── */

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
      {value && (
        <span className="shrink-0 text-white/50 text-[12px]">{value}</span>
      )}
      <svg viewBox="0 0 24 24" fill="currentColor" className="shrink-0 w-4 h-4 text-white/30">
        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
      </svg>
    </button>
  );
}

function OptionRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2.5 text-left text-[13px] transition-colors',
        selected ? 'text-white bg-white/[0.08]' : 'text-white/70 hover:bg-white/[0.06]',
      )}
    >
      <span className="shrink-0 w-5 h-5 flex items-center justify-center">
        {selected && (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        )}
      </span>
      <span className="flex-1">{label}</span>
    </button>
  );
}

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

/** Slider sub-view for continuous values */
function SliderView({
  title,
  value,
  min,
  max,
  step,
  displayValue,
  defaultValue,
  onChange,
  onBack,
}: {
  title: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  defaultValue: number;
  onChange: (v: number) => void;
  onBack: () => void;
}) {
  return (
    <>
      <SubMenuHeader title={title} onBack={onBack} />
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-white/80">{title}</span>
          <span className="text-[13px] text-white/50 tabular-nums">{displayValue}</span>
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
        {value !== defaultValue && (
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            className="w-full py-2 text-[13px] text-white/60 hover:text-white/80 hover:bg-white/[0.06]
              rounded transition-colors"
          >
            Reset to default
          </button>
        )}
      </div>
    </>
  );
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
  const [, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const [view, setView] = useState<PanelView>('main');
  const directionRef = useRef(1);
  const navigateTo = (v: PanelView) => { directionRef.current = 1; setView(v); };
  const navigateBack = () => { directionRef.current = -1; setView('main'); };

  const filters = plugin.getFilterState();
  const volume = plugin.getVolume();
  const audioTracks = plugin.getAudioTracks();

  const updateFilter = useCallback(
    (key: keyof VideoFilterState, value: number) => {
      const setters: Record<keyof VideoFilterState, (v: number) => void> = {
        brightness: plugin.setBrightness,
        contrast: plugin.setContrast,
        saturation: plugin.setSaturation,
        warmth: plugin.setWarmth,
      };
      setters[key](value);
      refresh();
    },
    [plugin, refresh],
  );

  const renderContent = () => {
    switch (view) {
      case 'brightness':
        return (
          <SliderView
            title="Brightness"
            value={filters.brightness}
            min={0} max={200} step={5}
            displayValue={`${filters.brightness}%`}
            defaultValue={100}
            onChange={(v) => updateFilter('brightness', v)}
            onBack={navigateBack}
          />
        );
      case 'contrast':
        return (
          <SliderView
            title="Contrast"
            value={filters.contrast}
            min={0} max={200} step={5}
            displayValue={`${filters.contrast}%`}
            defaultValue={100}
            onChange={(v) => updateFilter('contrast', v)}
            onBack={navigateBack}
          />
        );
      case 'saturation':
        return (
          <SliderView
            title="Saturation"
            value={filters.saturation}
            min={0} max={200} step={5}
            displayValue={`${filters.saturation}%`}
            defaultValue={100}
            onChange={(v) => updateFilter('saturation', v)}
            onBack={navigateBack}
          />
        );
      case 'warmth':
        return (
          <SliderView
            title="Night Mode"
            value={filters.warmth}
            min={0} max={100} step={5}
            displayValue={`${filters.warmth}%`}
            defaultValue={0}
            onChange={(v) => updateFilter('warmth', v)}
            onBack={navigateBack}
          />
        );
      case 'volumeBoost':
        return (
          <SliderView
            title="Volume Boost"
            value={volume}
            min={0} max={200} step={5}
            displayValue={`${volume}%`}
            defaultValue={100}
            onChange={(v) => { plugin.setVolume(v); refresh(); }}
            onBack={navigateBack}
          />
        );
      case 'audioTrack':
        return (
          <>
            <SubMenuHeader title="Audio Track" onBack={navigateBack} />
            {audioTracks.map((track) => (
              <OptionRow
                key={track.index}
                label={`${track.label}${track.language ? ` (${track.language})` : ''}`}
                selected={track.enabled}
                onClick={() => { plugin.setAudioTrack(track.index); refresh(); setView('main'); }}
              />
            ))}
          </>
        );
      default:
        return (
          <>
            <MenuRow
              icon={<IconBrightness />}
              label="Brightness"
              value={filters.brightness !== 100 ? `${filters.brightness}%` : undefined}
              onClick={() => navigateTo('brightness')}
            />
            <MenuRow
              icon={<IconContrast />}
              label="Contrast"
              value={filters.contrast !== 100 ? `${filters.contrast}%` : undefined}
              onClick={() => navigateTo('contrast')}
            />
            <MenuRow
              icon={<IconSaturation />}
              label="Saturation"
              value={filters.saturation !== 100 ? `${filters.saturation}%` : undefined}
              onClick={() => navigateTo('saturation')}
            />
            <MenuRow
              icon={<IconNight />}
              label="Night Mode"
              value={filters.warmth > 0 ? `${filters.warmth}%` : undefined}
              onClick={() => navigateTo('warmth')}
            />
            <div className="border-t border-white/[0.08] my-0.5" />
            <MenuRow
              icon={<IconVolume />}
              label="Volume Boost"
              value={volume !== 100 ? `${volume}%` : undefined}
              onClick={() => navigateTo('volumeBoost')}
            />
            {audioTracks.length > 1 && (
              <MenuRow
                icon={<IconAudio />}
                label="Audio Track"
                value={audioTracks.find((t) => t.enabled)?.label}
                onClick={() => navigateTo('audioTrack')}
              />
            )}
          </>
        );
    }
  };

  return (
    <>
      <div className="absolute inset-0 z-[100]" onClick={onClose} />
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
            key={view}
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

/* ─── Icons ──────────────────────────────────────────────────────── */

function IconBrightness() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z" />
    </svg>
  );
}

function IconContrast() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93s3.05-7.44 7-7.93v15.86z" />
    </svg>
  );
}

function IconSaturation() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
    </svg>
  );
}

function IconNight() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M9 2c-1.05 0-2.05.16-3 .46 4.06 1.27 7 5.06 7 9.54 0 4.48-2.94 8.27-7 9.54.95.3 1.95.46 3 .46 5.52 0 10-4.48 10-10S14.52 2 9 2z" />
    </svg>
  );
}

function IconVolume() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function IconAudio() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  );
}
