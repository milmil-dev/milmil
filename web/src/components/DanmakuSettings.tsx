import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { cn } from '@/lib/utils';
import { usePreferencesStore } from '@/store/preferences-store';

const FONT_SIZES = [16, 20, 24] as const;
const AREA_OPTIONS = [
  { value: 0.25, label: '25%' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
] as const;

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 py-1 text-[10px] rounded transition-colors',
        active ? 'bg-mm-accent text-black font-medium' : 'bg-mm-surface text-mm-text-secondary hover:text-mm-text'
      )}
    >
      {children}
    </button>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[10px] text-mm-text-muted block mb-1.5">{label}</span>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        className={cn(
          'w-7 h-4 rounded-full transition-colors relative',
          checked ? 'bg-mm-accent' : 'bg-mm-surface'
        )}
        onClick={() => onChange(!checked)}
      >
        <div
          className={cn(
            'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
            checked ? 'translate-x-3.5' : 'translate-x-0.5'
          )}
        />
      </div>
      <span className="text-[10px] text-mm-text-secondary">{label}</span>
    </label>
  );
}

/** Standalone settings controls for use in DanmakuBar popover */
export function DanmakuSettingsControls() {
  const { i18n } = useLingui();
  const enabled = usePreferencesStore((s) => s.danmakuEnabled);
  const opacity = usePreferencesStore((s) => s.danmakuOpacity);
  const fontSize = usePreferencesStore((s) => s.danmakuFontSize);
  const speed = usePreferencesStore((s) => s.danmakuSpeed);
  const area = usePreferencesStore((s) => s.danmakuArea);
  const bold = usePreferencesStore((s) => s.danmakuBold);
  const stroke = usePreferencesStore((s) => s.danmakuStroke);
  const filterScroll = usePreferencesStore((s) => s.danmakuFilterScroll);
  const filterTop = usePreferencesStore((s) => s.danmakuFilterTop);
  const filterBottom = usePreferencesStore((s) => s.danmakuFilterBottom);
  const antiSubtitle = usePreferencesStore((s) => s.danmakuAntiSubtitle);
  const update = usePreferencesStore((s) => s.updatePreference);

  return (
    <div className="space-y-3 w-56">
      {/* On/Off */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-mm-text-secondary font-medium">{i18n._(msg`watch.danmaku`)}</span>
        <button
          type="button"
          onClick={() => update('danmakuEnabled', !enabled)}
          className={cn(
            'px-2.5 py-0.5 text-[10px] font-medium rounded transition-colors',
            enabled ? 'bg-mm-accent text-black' : 'bg-mm-surface text-mm-text-muted'
          )}
        >
          {enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Type filter */}
      <SettingRow label={i18n._(msg`watch.danmaku.typeFilter`)}>
        <div className="flex gap-1">
          <SegmentButton
            active={filterScroll}
            onClick={() => update('danmakuFilterScroll', !filterScroll)}
          >
            {i18n._(msg`watch.danmaku.scroll`)}
          </SegmentButton>
          <SegmentButton
            active={filterTop}
            onClick={() => update('danmakuFilterTop', !filterTop)}
          >
            {i18n._(msg`watch.danmaku.top`)}
          </SegmentButton>
          <SegmentButton
            active={filterBottom}
            onClick={() => update('danmakuFilterBottom', !filterBottom)}
          >
            {i18n._(msg`watch.danmaku.bottom`)}
          </SegmentButton>
        </div>
      </SettingRow>

      {/* Display area */}
      <SettingRow label={i18n._(msg`watch.danmaku.displayArea`)}>
        <div className="flex gap-1">
          {AREA_OPTIONS.map((opt) => (
            <SegmentButton
              key={opt.value}
              active={area === opt.value}
              onClick={() => update('danmakuArea', opt.value)}
            >
              {opt.label}
            </SegmentButton>
          ))}
        </div>
      </SettingRow>

      {/* Opacity */}
      <SettingRow label={`${i18n._(msg`watch.danmaku.opacity`)} ${Math.round(opacity * 100)}%`}>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => update('danmakuOpacity', Number(e.target.value))}
          className="w-full h-1 accent-mm-accent"
        />
      </SettingRow>

      {/* Font size */}
      <SettingRow label={i18n._(msg`watch.danmaku.fontSize`)}>
        <div className="flex gap-1">
          {FONT_SIZES.map((s) => (
            <SegmentButton
              key={s}
              active={fontSize === s}
              onClick={() => update('danmakuFontSize', s)}
            >
              {s}
            </SegmentButton>
          ))}
        </div>
      </SettingRow>

      {/* Speed */}
      <SettingRow label={i18n._(msg`watch.danmaku.speed`)}>
        <div className="flex gap-1">
          {[
            { label: i18n._(msg`watch.danmaku.slow`), value: 100 },
            { label: i18n._(msg`watch.danmaku.normal`), value: 144 },
            { label: i18n._(msg`watch.danmaku.fast`), value: 200 },
          ].map((s) => (
            <SegmentButton
              key={s.value}
              active={speed === s.value}
              onClick={() => update('danmakuSpeed', s.value)}
            >
              {s.label}
            </SegmentButton>
          ))}
        </div>
      </SettingRow>

      {/* Stroke type */}
      <SettingRow label={i18n._(msg`watch.danmaku.strokeType`)}>
        <div className="flex gap-1">
          {[
            { label: i18n._(msg`watch.danmaku.strokeNone`), value: 'none' as const },
            { label: i18n._(msg`watch.danmaku.strokeShadow`), value: 'shadow' as const },
            { label: i18n._(msg`watch.danmaku.strokeOutline`), value: 'stroke' as const },
          ].map((s) => (
            <SegmentButton
              key={s.value}
              active={stroke === s.value}
              onClick={() => update('danmakuStroke', s.value)}
            >
              {s.label}
            </SegmentButton>
          ))}
        </div>
      </SettingRow>

      {/* Toggles */}
      <div className="space-y-2 pt-1 border-t border-mm-border">
        <Toggle
          checked={bold}
          onChange={(v) => update('danmakuBold', v)}
          label={i18n._(msg`watch.danmaku.bold`)}
        />
        <Toggle
          checked={antiSubtitle}
          onChange={(v) => update('danmakuAntiSubtitle', v)}
          label={i18n._(msg`watch.danmaku.antiSubtitle`)}
        />
      </div>
    </div>
  );
}
