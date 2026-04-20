import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { cn } from '@/lib/utils';
import { usePreferencesStore } from '@/store/preferences-store';

const FONT_SIZES = [16, 20, 24] as const;
const AREA_OPTIONS = [
  { value: 0.25, label: '1/4' },
  { value: 0.5, label: '1/2' },
  { value: 0.75, label: '3/4' },
  { value: 1, label: '全' },
] as const;

/* ── Primitives ── */

function Seg({
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
        'flex-1 py-[5px] text-[11px] rounded-md transition-all',
        active
          ? 'bg-white/[0.12] text-white font-medium shadow-sm'
          : 'text-white/35 hover:text-white/55 hover:bg-white/[0.04]'
      )}
    >
      {children}
    </button>
  );
}

function Row({ label, children, end }: { label: string; children: React.ReactNode; end?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-white/35">{label}</span>
        {end}
      </div>
      {children}
    </div>
  );
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        'w-8 h-[18px] rounded-full transition-colors relative shrink-0',
        checked ? 'bg-white/20' : 'bg-white/[0.08]'
      )}
    >
      <div
        className={cn(
          'absolute top-[3px] w-3 h-3 rounded-full transition-all',
          checked
            ? 'left-[17px] bg-white'
            : 'left-[3px] bg-white/40'
        )}
      />
    </button>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="w-full flex items-center justify-between py-0.5 group"
    >
      <span className="text-[11px] text-white/45 group-hover:text-white/60 transition-colors">{label}</span>
      <Switch checked={checked} onChange={onChange} />
    </button>
  );
}

/* ── Main component ── */

export function DanmakuSettingsControls() {
  const { i18n } = useLingui();
  const enabled = usePreferencesStore((s) => s.danmakuEnabled);
  const opacity = usePreferencesStore((s) => s.danmakuOpacity);
  const fontSize = usePreferencesStore((s) => s.danmakuFontSize);
  const speed = usePreferencesStore((s) => s.danmakuSpeed);
  const density = usePreferencesStore((s) => s.danmakuDensity);
  const area = usePreferencesStore((s) => s.danmakuArea);
  const bold = usePreferencesStore((s) => s.danmakuBold);
  const stroke = usePreferencesStore((s) => s.danmakuStroke);
  const filterScroll = usePreferencesStore((s) => s.danmakuFilterScroll);
  const filterTop = usePreferencesStore((s) => s.danmakuFilterTop);
  const filterBottom = usePreferencesStore((s) => s.danmakuFilterBottom);
  const antiSubtitle = usePreferencesStore((s) => s.danmakuAntiSubtitle);
  const update = usePreferencesStore((s) => s.updatePreference);

  return (
    <div className="w-60 space-y-3">
      {/* Header: 彈幕 ON/OFF */}
      <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
        <span className="text-[12px] text-white/70 font-medium">{i18n._(msg`watch.danmaku`)}</span>
        <button
          type="button"
          onClick={() => update('danmakuEnabled', !enabled)}
          className={cn(
            'px-2.5 py-[3px] text-[10px] font-semibold rounded-md tracking-wide transition-all',
            enabled
              ? 'bg-white/15 text-white'
              : 'bg-white/[0.06] text-white/30'
          )}
        >
          {enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Type filter */}
      <Row label={i18n._(msg`watch.danmaku.typeFilter`)}>
        <div className="flex gap-1">
          <Seg active={filterScroll} onClick={() => update('danmakuFilterScroll', !filterScroll)}>
            {i18n._(msg`watch.danmaku.scroll`)}
          </Seg>
          <Seg active={filterTop} onClick={() => update('danmakuFilterTop', !filterTop)}>
            {i18n._(msg`watch.danmaku.top`)}
          </Seg>
          <Seg active={filterBottom} onClick={() => update('danmakuFilterBottom', !filterBottom)}>
            {i18n._(msg`watch.danmaku.bottom`)}
          </Seg>
        </div>
      </Row>

      {/* Display area */}
      <Row label={i18n._(msg`watch.danmaku.displayArea`)}>
        <div className="flex gap-1">
          {AREA_OPTIONS.map((opt) => (
            <Seg key={opt.value} active={area === opt.value} onClick={() => update('danmakuArea', opt.value)}>
              {opt.label}
            </Seg>
          ))}
        </div>
      </Row>

      {/* Density */}
      <Row label={i18n._(msg`watch.danmaku.density`)}>
        <div className="flex gap-1">
          {(['low', 'medium', 'high'] as const).map((d) => (
            <Seg key={d} active={density === d} onClick={() => update('danmakuDensity', d)}>
              {i18n._(msg`settings.player.density.${d}`)}
            </Seg>
          ))}
        </div>
      </Row>

      {/* Opacity */}
      <Row label={i18n._(msg`watch.danmaku.opacity`)} end={<span className="text-[10px] text-white/25 tabular-nums">{Math.round(opacity * 100)}%</span>}>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => update('danmakuOpacity', Number(e.target.value))}
          className="w-full h-1 rounded-full appearance-none bg-white/[0.08] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-sm"
        />
      </Row>

      {/* Font size */}
      <Row label={i18n._(msg`watch.danmaku.fontSize`)}>
        <div className="flex gap-1">
          {FONT_SIZES.map((s) => (
            <Seg key={s} active={fontSize === s} onClick={() => update('danmakuFontSize', s)}>
              {s}
            </Seg>
          ))}
        </div>
      </Row>

      {/* Speed */}
      <Row label={i18n._(msg`watch.danmaku.speed`)}>
        <div className="flex gap-1">
          {[
            { label: i18n._(msg`watch.danmaku.slow`), value: 100 },
            { label: i18n._(msg`watch.danmaku.normal`), value: 144 },
            { label: i18n._(msg`watch.danmaku.fast`), value: 200 },
          ].map((s) => (
            <Seg key={s.value} active={speed === s.value} onClick={() => update('danmakuSpeed', s.value)}>
              {s.label}
            </Seg>
          ))}
        </div>
      </Row>

      {/* Stroke type */}
      <Row label={i18n._(msg`watch.danmaku.strokeType`)}>
        <div className="flex gap-1">
          {[
            { label: i18n._(msg`watch.danmaku.strokeNone`), value: 'none' as const },
            { label: i18n._(msg`watch.danmaku.strokeShadow`), value: 'shadow' as const },
            { label: i18n._(msg`watch.danmaku.strokeOutline`), value: 'stroke' as const },
          ].map((s) => (
            <Seg key={s.value} active={stroke === s.value} onClick={() => update('danmakuStroke', s.value)}>
              {s.label}
            </Seg>
          ))}
        </div>
      </Row>

      {/* Toggles */}
      <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
        <SwitchRow
          label={i18n._(msg`watch.danmaku.bold`)}
          checked={bold}
          onChange={() => update('danmakuBold', !bold)}
        />
        <SwitchRow
          label={i18n._(msg`watch.danmaku.antiSubtitle`)}
          checked={antiSubtitle}
          onChange={() => update('danmakuAntiSubtitle', !antiSubtitle)}
        />
      </div>
    </div>
  );
}
