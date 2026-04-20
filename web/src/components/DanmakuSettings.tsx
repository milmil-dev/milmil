import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { usePreferencesStore } from '@/store/preferences-store';

/* ── Constants ── */

const DANMAKU_COLORS = [
  { value: '#FFFFFF', label: '白' },
  { value: '#FFE600', label: '黃' },
  { value: '#FF6B6B', label: '紅' },
  { value: '#66CCFF', label: '藍' },
  { value: '#00FF00', label: '綠' },
  { value: '#FF69B4', label: '粉' },
  { value: '#FFA500', label: '橙' },
  { value: '#CC66FF', label: '紫' },
];
const AREA_OPTIONS = [
  { value: 0.25, label: '1/4' },
  { value: 0.5, label: '1/2' },
  { value: 0.75, label: '3/4' },
  { value: 1, label: '全' },
] as const;
const FONT_FAMILIES = [
  { value: 'sans-serif', label: '黑體' },
  { value: 'serif', label: '宋體' },
  { value: '"Noto Sans SC", sans-serif', label: 'Noto' },
  { value: 'monospace', label: '等寬' },
] as const;

type View = 'main' | 'typeFilter' | 'area' | 'density' | 'font' | 'color' | 'speed' | 'stroke' | 'block';

const ic = 'w-[18px] h-[18px] text-white/50';

/* ── Shared UI primitives (matching player settings style) ── */

function MenuRow({ icon, label, value, onClick }: {
  icon?: React.ReactNode; label: string; value?: React.ReactNode; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.04] transition-colors">
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="flex-1 text-[13px] text-white/80">{label}</span>
      {value && <span className="text-[12px] text-white/35 flex items-center">{value}</span>}
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white/20 shrink-0"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
    </button>
  );
}

function OptionRow({ label, selected, onClick }: {
  label: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn('w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
        selected ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]')}>
      <span className={cn('flex-1 text-[13px]', selected ? 'text-white' : 'text-white/50')}>{label}</span>
      {selected && (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-blue-400 shrink-0"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
      )}
    </button>
  );
}

function PanelHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <button type="button" onClick={onBack}
      className="w-full flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors">
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white/40"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      <span className="text-[13px] text-white/70 font-medium">{title}</span>
    </button>
  );
}

function Divider() {
  return <div className="mx-3 my-1 border-t border-white/[0.04]" />;
}

function SliderRow({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] text-white/70">{label}</span>
        <span className="text-[12px] text-white/30 tabular-nums">{unit === '%' ? `${Math.round(value * 100)}%` : `${Math.round(value)}${unit ?? ''}`}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 rounded-full appearance-none bg-white/[0.08] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-sm"
      />
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: () => void;
}) {
  return (
    <button type="button" onClick={onChange}
      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.03] transition-colors">
      <span className="text-[13px] text-white/70">{label}</span>
      <div className={cn('w-8 h-[18px] rounded-full transition-colors relative', checked ? 'bg-white/20' : 'bg-white/[0.08]')}>
        <div className={cn('absolute top-[3px] w-3 h-3 rounded-full transition-all', checked ? 'left-[17px] bg-white' : 'left-[3px] bg-white/40')} />
      </div>
    </button>
  );
}

/* ── Main component ── */

export function DanmakuSettingsControls() {
  const { i18n } = useLingui();
  const [view, setView] = useState<View>('main');
  const dirRef = useRef(1);

  const go = (v: View) => { dirRef.current = 1; setView(v); };
  const back = () => { dirRef.current = -1; setView('main'); };

  const enabled = usePreferencesStore((s) => s.danmakuEnabled);
  const opacity = usePreferencesStore((s) => s.danmakuOpacity);
  const fontSize = usePreferencesStore((s) => s.danmakuFontSize);
  const speed = usePreferencesStore((s) => s.danmakuSpeed);
  const density = usePreferencesStore((s) => s.danmakuDensity);
  const area = usePreferencesStore((s) => s.danmakuArea);
  const bold = usePreferencesStore((s) => s.danmakuBold);
  const stroke = usePreferencesStore((s) => s.danmakuStroke);
  const fontFamily = usePreferencesStore((s) => s.danmakuFontFamily);
  const filterScroll = usePreferencesStore((s) => s.danmakuFilterScroll);
  const filterTop = usePreferencesStore((s) => s.danmakuFilterTop);
  const filterBottom = usePreferencesStore((s) => s.danmakuFilterBottom);
  const antiSubtitle = usePreferencesStore((s) => s.danmakuAntiSubtitle);
  const danmakuColor = usePreferencesStore((s) => s.danmakuColor);
  const blockKeywords = usePreferencesStore((s) => s.danmakuBlockKeywords);
  const update = usePreferencesStore((s) => s.updatePreference);
  const [newKeyword, setNewKeyword] = useState('');

  const densityLabels: Record<string, string> = {
    low: i18n._(msg`watch.danmaku.densityLow`),
    medium: i18n._(msg`watch.danmaku.densityMedium`),
    high: i18n._(msg`watch.danmaku.densityHigh`),
  };
  const speedLabels: Record<number, string> = {
    100: i18n._(msg`watch.danmaku.slow`),
    144: i18n._(msg`watch.danmaku.normal`),
    200: i18n._(msg`watch.danmaku.fast`),
  };
  const strokeLabels: Record<string, string> = {
    none: i18n._(msg`watch.danmaku.strokeNone`),
    shadow: i18n._(msg`watch.danmaku.strokeShadow`),
    stroke: i18n._(msg`watch.danmaku.strokeOutline`),
  };
  const areaLabel = AREA_OPTIONS.find((o) => o.value === area)?.label ?? '全';
  const fontLabel = FONT_FAMILIES.find((f) => f.value === fontFamily)?.label ?? '黑體';

  const activeFilters = [filterScroll && i18n._(msg`watch.danmaku.scroll`), filterTop && i18n._(msg`watch.danmaku.top`), filterBottom && i18n._(msg`watch.danmaku.bottom`)].filter(Boolean);

  const renderView = () => {
    switch (view) {
      case 'typeFilter':
        return (<>
          <PanelHeader title={i18n._(msg`watch.danmaku.typeFilter`)} onBack={back} />
          <ToggleRow label={i18n._(msg`watch.danmaku.scroll`)} checked={filterScroll} onChange={() => update('danmakuFilterScroll', !filterScroll)} />
          <ToggleRow label={i18n._(msg`watch.danmaku.top`)} checked={filterTop} onChange={() => update('danmakuFilterTop', !filterTop)} />
          <ToggleRow label={i18n._(msg`watch.danmaku.bottom`)} checked={filterBottom} onChange={() => update('danmakuFilterBottom', !filterBottom)} />
        </>);

      case 'area':
        return (<>
          <PanelHeader title={i18n._(msg`watch.danmaku.displayArea`)} onBack={back} />
          {AREA_OPTIONS.map((o) => (
            <OptionRow key={o.value} label={o.label} selected={area === o.value} onClick={() => { update('danmakuArea', o.value); back(); }} />
          ))}
        </>);

      case 'density':
        return (<>
          <PanelHeader title={i18n._(msg`watch.danmaku.density`)} onBack={back} />
          {(['low', 'medium', 'high'] as const).map((d) => (
            <OptionRow key={d} label={densityLabels[d]!} selected={density === d} onClick={() => { update('danmakuDensity', d); back(); }} />
          ))}
        </>);

      case 'color':
        return (<>
          <PanelHeader title={i18n._(msg`watch.danmaku.fontColor`)} onBack={back} />
          <div className="px-3 py-3 grid grid-cols-4 gap-2">
            {DANMAKU_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => { update('danmakuColor', c.value); back(); }}
                className={cn(
                  'flex flex-col items-center gap-1.5 py-2 rounded-lg transition-colors',
                  danmakuColor === c.value ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                )}
              >
                <div
                  className={cn(
                    'w-6 h-6 rounded-full border-2',
                    danmakuColor === c.value ? 'border-white/60' : 'border-white/10'
                  )}
                  style={{ backgroundColor: c.value }}
                />
                <span className="text-[10px] text-white/40">{c.label}</span>
              </button>
            ))}
          </div>
        </>);

      case 'font':
        return (<>
          <PanelHeader title={i18n._(msg`watch.danmaku.fontFamily`)} onBack={back} />
          {FONT_FAMILIES.map((f) => (
            <OptionRow key={f.value} label={f.label} selected={fontFamily === f.value} onClick={() => { update('danmakuFontFamily', f.value); back(); }} />
          ))}
        </>);

      case 'speed':
        return (<>
          <PanelHeader title={i18n._(msg`watch.danmaku.speed`)} onBack={back} />
          {[100, 144, 200].map((s) => (
            <OptionRow key={s} label={speedLabels[s]!} selected={speed === s} onClick={() => { update('danmakuSpeed', s); back(); }} />
          ))}
        </>);

      case 'stroke':
        return (<>
          <PanelHeader title={i18n._(msg`watch.danmaku.strokeType`)} onBack={back} />
          {(['none', 'shadow', 'stroke'] as const).map((s) => (
            <OptionRow key={s} label={strokeLabels[s]!} selected={stroke === s} onClick={() => { update('danmakuStroke', s); back(); }} />
          ))}
        </>);

      case 'block':
        return (<>
          <PanelHeader title={i18n._(msg`watch.danmaku.blockKeywords`)} onBack={back} />
          {/* Add keyword input */}
          <div className="px-3 pt-2 pb-1 flex gap-1.5">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newKeyword.trim()) {
                  update('danmakuBlockKeywords', [...blockKeywords, newKeyword.trim()]);
                  setNewKeyword('');
                }
              }}
              placeholder={i18n._(msg`watch.danmaku.blockPlaceholder`)}
              className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-md px-2 py-1.5 text-[12px] text-white placeholder:text-white/20 outline-none focus:border-white/15"
            />
            <button
              type="button"
              onClick={() => {
                if (newKeyword.trim()) {
                  update('danmakuBlockKeywords', [...blockKeywords, newKeyword.trim()]);
                  setNewKeyword('');
                }
              }}
              disabled={!newKeyword.trim()}
              className="shrink-0 text-[11px] text-white/50 hover:text-white/80 px-2 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-30 transition-colors"
            >
              +
            </button>
          </div>
          {/* Keyword list */}
          {blockKeywords.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] text-white/25">
              {i18n._(msg`watch.danmaku.noBlockKeywords`)}
            </div>
          ) : (
            <div className="px-3 py-2 flex flex-wrap gap-1.5">
              {blockKeywords.map((kw, idx) => (
                <span
                  key={`${kw}-${idx}`}
                  className="inline-flex items-center gap-1 bg-white/[0.06] text-[11px] text-white/60 rounded-md px-2 py-1"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={() => update('danmakuBlockKeywords', blockKeywords.filter((_, i) => i !== idx))}
                    className="text-white/25 hover:text-white/60 transition-colors"
                  >
                    <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5">
                      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
          {blockKeywords.length > 0 && (
            <button
              type="button"
              onClick={() => update('danmakuBlockKeywords', [])}
              className="w-full px-3 py-2 text-[11px] text-red-400/50 hover:text-red-400/80 text-center transition-colors"
            >
              {i18n._(msg`watch.danmaku.clearAllBlock`)}
            </button>
          )}
        </>);

      default:
        return (<>
          {/* On/Off */}
          <ToggleRow label={i18n._(msg`watch.danmaku`)} checked={enabled} onChange={() => update('danmakuEnabled', !enabled)} />
          <Divider />
          <MenuRow label={i18n._(msg`watch.danmaku.typeFilter`)} value={activeFilters.join('·') || '—'} onClick={() => go('typeFilter')} />
          <MenuRow label={i18n._(msg`watch.danmaku.displayArea`)} value={areaLabel} onClick={() => go('area')} />
          <MenuRow label={i18n._(msg`watch.danmaku.density`)} value={densityLabels[density]} onClick={() => go('density')} />
          <Divider />
          <SliderRow label={i18n._(msg`watch.danmaku.opacity`)} value={opacity} min={0.1} max={1} step={0.05} unit="%" onChange={(v) => update('danmakuOpacity', v)} />
          <SliderRow label={i18n._(msg`watch.danmaku.fontSize`)} value={fontSize} min={12} max={36} step={1} unit="px" onChange={(v) => update('danmakuFontSize', v)} />
          <Divider />
          <MenuRow label={i18n._(msg`watch.danmaku.fontColor`)} value={<span className="inline-block w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: danmakuColor }} />} onClick={() => go('color')} />
          <MenuRow label={i18n._(msg`watch.danmaku.fontFamily`)} value={fontLabel} onClick={() => go('font')} />
          <MenuRow label={i18n._(msg`watch.danmaku.speed`)} value={speedLabels[speed] ?? i18n._(msg`watch.danmaku.normal`)} onClick={() => go('speed')} />
          <MenuRow label={i18n._(msg`watch.danmaku.strokeType`)} value={strokeLabels[stroke]} onClick={() => go('stroke')} />
          <Divider />
          <ToggleRow label={i18n._(msg`watch.danmaku.bold`)} checked={bold} onChange={() => update('danmakuBold', !bold)} />
          <ToggleRow label={i18n._(msg`watch.danmaku.antiSubtitle`)} checked={antiSubtitle} onChange={() => update('danmakuAntiSubtitle', !antiSubtitle)} />
          <Divider />
          <MenuRow label={i18n._(msg`watch.danmaku.blockKeywords`)} value={blockKeywords.length > 0 ? `${blockKeywords.length}` : undefined} onClick={() => go('block')} />
        </>);
    }
  };

  return (
    <div className="w-[240px] max-h-[60vh] overflow-y-auto" data-settings-panel>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0, x: dirRef.current * 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dirRef.current * -20 }}
          transition={{ duration: 0.15 }}
        >
          {renderView()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
