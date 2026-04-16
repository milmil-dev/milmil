import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { toast } from 'sonner';
import { SelectorGroup } from '@/components/settings/SelectorGroup';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { KeyBindingPanel } from '@/plugins/keyboard/KeyBindingPanel';
import { usePreferencesStore } from '@/store/preferences-store';
import { SUBTITLE_PRESETS } from '@/plugins/subtitle/StyleEngine';
import type { SubtitleStyle } from '@/lib/api/preferences';

const FONT_SIZE_OPTIONS = [
  { label: '16px', value: 16 },
  { label: '20px', value: 20 },
  { label: '24px', value: 24 },
] as const;

const SUBTITLE_FONT_OPTIONS = [
  { label: 'Noto Sans CJK', value: 'Noto Sans CJK' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS, sans-serif' },
  { label: 'Courier New', value: 'Courier New, monospace' },
];

const COLOR_SWATCHES = [
  { label: 'White', value: '#FFFFFF' },
  { label: 'Yellow', value: '#FFE600' },
  { label: 'Green', value: '#00FF00' },
  { label: 'Cyan', value: '#00FFFF' },
];

const PRESET_OPTIONS = [
  { label: 'Default', value: 'default' },
  { label: 'Cinema', value: 'cinema' },
  { label: 'Anime', value: 'anime' },
  { label: 'High Contrast', value: 'highContrast' },
];

const SHADOW_TYPE_OPTIONS = [
  { label: 'None', value: 'none' as const },
  { label: 'Outline', value: 'outline' as const },
  { label: 'Drop Shadow', value: 'drop-shadow' as const },
  { label: 'Raised', value: 'raised' as const },
  { label: 'Depressed', value: 'depressed' as const },
];

const POSITION_OPTIONS = [
  { label: 'Top', value: 'top' as const },
  { label: 'Center', value: 'center' as const },
  { label: 'Bottom', value: 'bottom' as const },
];

// Styled range input helper
function RangeSlider({
  min,
  max,
  value,
  onChange,
  onCommit,
  step,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  step?: number;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      onMouseUp={onCommit ? (e) => onCommit(Number((e.target as HTMLInputElement).value)) : undefined}
      onTouchEnd={onCommit ? (e) => onCommit(Number((e.target as HTMLInputElement).value)) : undefined}
      className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-white/50"
      style={{
        background: `linear-gradient(to right, oklch(70% 0.01 280) ${String(pct)}%, oklch(18% 0.01 280) ${String(pct)}%)`,
      }}
    />
  );
}

// Subtitle live preview
function SubtitlePreview({ style }: { style: SubtitleStyle }) {
  const textShadow = (() => {
    switch (style.shadowType) {
      case 'outline':
        return `${String(style.strokeWidth)}px ${String(style.strokeWidth)}px 0 ${style.strokeColor}, -${String(style.strokeWidth)}px -${String(style.strokeWidth)}px 0 ${style.strokeColor}, ${String(style.strokeWidth)}px -${String(style.strokeWidth)}px 0 ${style.strokeColor}, -${String(style.strokeWidth)}px ${String(style.strokeWidth)}px 0 ${style.strokeColor}`;
      case 'drop-shadow':
        return `2px 2px 4px ${style.strokeColor}`;
      case 'raised':
        return `1px 1px 0 ${style.strokeColor}, 2px 2px 0 ${style.strokeColor}`;
      case 'depressed':
        return `-1px -1px 0 ${style.strokeColor}, -2px -2px 0 ${style.strokeColor}`;
      default:
        return 'none';
    }
  })();

  const justifyContent =
    style.position === 'top' ? 'flex-start' : style.position === 'center' ? 'center' : 'flex-end';

  return (
    <div
      className="relative mt-3 flex overflow-hidden rounded-lg border border-white/[0.06]"
      style={{
        height: 120,
        background: 'linear-gradient(135deg, #0a0a14 0%, #1a1a2e 100%)',
        justifyContent,
        alignItems: 'center',
        flexDirection: 'column',
        padding: `${String(style.safeMargin * 1.2)}px ${String(style.safeMargin * 2)}px`,
      }}
    >
      <div style={{ flex: style.position === 'top' ? 0 : 1 }} />
      <div
        style={{
          fontFamily: style.fontFamily,
          fontSize: Math.min(style.fontSize, 28),
          color: style.color,
          backgroundColor:
            style.backgroundOpacity > 0
              ? `${style.backgroundColor}${Math.round(style.backgroundOpacity * 255).toString(16).padStart(2, '0')}`
              : 'transparent',
          textShadow,
          padding: '2px 8px',
          borderRadius: 4,
          transition: 'all 0.2s ease',
          textAlign: 'center' as const,
        }}
      >
        Sample Subtitle Text
      </div>
      <div style={{ flex: style.position === 'bottom' ? 0 : 1 }} />
    </div>
  );
}

export function PlayerPanel() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const speedOptions = [
    { label: i18n._(msg`settings.player.speed.slow`), value: 96 },
    { label: i18n._(msg`settings.player.speed.normal`), value: 144 },
    { label: i18n._(msg`settings.player.speed.fast`), value: 200 },
  ];

  const danmakuEnabled = usePreferencesStore((s) => s.danmakuEnabled);
  const danmakuOpacity = usePreferencesStore((s) => s.danmakuOpacity);
  const danmakuFontSize = usePreferencesStore((s) => s.danmakuFontSize);
  const danmakuSpeed = usePreferencesStore((s) => s.danmakuSpeed);
  const danmakuDensity = usePreferencesStore((s) => s.danmakuDensity);
  const bufferMode = usePreferencesStore((s) => s.bufferMode);

  // Subtitle preferences
  const subtitleStyle = usePreferencesStore((s) => s.subtitleStyle);
  const subtitlePreset = usePreferencesStore((s) => s.subtitlePreset);
  const updateSubtitleStyle = usePreferencesStore((s) => s.updateSubtitleStyle);
  const updatePreference = usePreferencesStore((s) => s.updatePreference);

  // Gesture preferences
  const gestureEnabled = usePreferencesStore((s) => s.gestureEnabled);
  const gestureSensitivity = usePreferencesStore((s) => s.gestureSensitivity);

  // Playback preferences
  const autoNext = usePreferencesStore((s) => s.autoNext);
  const autoSkipOp = usePreferencesStore((s) => s.autoSkipOp);
  const autoSkipEd = usePreferencesStore((s) => s.autoSkipEd);

  const saveMutation = useMutation({
    mutationFn: (data: {
      danmaku_enabled: boolean;
      danmaku_opacity: number;
      danmaku_font_size: number;
      danmaku_speed: number;
    }) => api.put('/api/v1/settings/player', data),
    onSuccess: (_data, variables) => {
      const store = usePreferencesStore.getState();
      if (variables.danmaku_enabled !== store.danmakuEnabled) store.toggleDanmaku();
      store.setDanmakuOpacity(variables.danmaku_opacity);
      store.setDanmakuFontSize(variables.danmaku_font_size);
      store.setDanmakuSpeed(variables.danmaku_speed);

      toast.success(i18n._(msg`settings.saved`));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error(i18n._(msg`settings.saveFailed`)),
  });

  const save = (overrides: Partial<{
    enabled: boolean;
    opacity: number;
    fontSize: number;
    speed: number;
  }>) => {
    const store = usePreferencesStore.getState();
    saveMutation.mutate({
      danmaku_enabled: overrides.enabled ?? store.danmakuEnabled,
      danmaku_opacity: overrides.opacity != null ? overrides.opacity / 100 : store.danmakuOpacity,
      danmaku_font_size: overrides.fontSize ?? store.danmakuFontSize,
      danmaku_speed: overrides.speed ?? store.danmakuSpeed,
    });
  };

  const applyPreset = (presetName: string) => {
    const preset = SUBTITLE_PRESETS[presetName];
    if (!preset) return;
    updatePreference('subtitlePreset', presetName);
    updateSubtitleStyle({
      fontFamily: preset.fontFamily,
      fontSize: preset.fontSize,
      color: preset.color,
      backgroundColor: preset.backgroundColor,
      backgroundOpacity: preset.backgroundOpacity,
      strokeWidth: preset.strokeWidth,
      strokeColor: preset.strokeColor,
      shadowType: preset.shadowType,
      position: preset.position,
      positionOffset: preset.positionOffset,
      safeMargin: preset.safeMargin,
      fadeAnimation: preset.fadeAnimation,
      respectAssStyle: preset.respectAssStyle,
    });
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-white">{i18n._(msg`settings.nav.player`)}</h2>
      <p className="mt-1 mb-6 text-xs text-white/35">{i18n._(msg`settings.player.subtitle`)}</p>

      <div className="space-y-3">
        {/* ── Danmaku Settings ── */}
        <SettingsCard label={i18n._(msg`settings.player.danmaku`)}>
          <div className="space-y-4">
            {/* Danmaku enabled toggle */}
            <div className="flex items-center justify-between">
              <Label className="text-sm text-mm-text-secondary">
                {i18n._(msg`settings.player.danmakuEnabled`)}
              </Label>
              <Switch
                checked={danmakuEnabled}
                onCheckedChange={(checked) => save({ enabled: checked })}
              />
            </div>

            {/* Remaining controls — disabled when danmaku is off */}
            <div className={cn('space-y-4', !danmakuEnabled && 'opacity-50 pointer-events-none')}>
              {/* Opacity slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-mm-text-secondary">
                    {i18n._(msg`settings.player.danmakuOpacity`)}
                  </Label>
                  <span className="text-xs text-mm-text-tertiary tabular-nums">
                    {Math.round(danmakuOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(danmakuOpacity * 100)}
                  onChange={(e) => {
                    usePreferencesStore.getState().setDanmakuOpacity(Number(e.target.value) / 100);
                  }}
                  onMouseUp={(e) => save({ opacity: Number((e.target as HTMLInputElement).value) })}
                  onTouchEnd={(e) => save({ opacity: Number((e.target as HTMLInputElement).value) })}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-white/50"
                  style={{
                    background: `linear-gradient(to right, oklch(70% 0.01 280) ${String(Math.round(danmakuOpacity * 100))}%, oklch(18% 0.01 280) ${String(Math.round(danmakuOpacity * 100))}%)`,
                  }}
                />
              </div>

              {/* Font size selector */}
              <div className="space-y-2">
                <Label className="text-sm text-mm-text-secondary">
                  {i18n._(msg`settings.player.danmakuFontSize`)}
                </Label>
                <SelectorGroup
                  options={[...FONT_SIZE_OPTIONS]}
                  value={danmakuFontSize}
                  onChange={(v) => save({ fontSize: v })}
                />
              </div>

              {/* Speed selector */}
              <div className="space-y-2">
                <Label className="text-sm text-mm-text-secondary">
                  {i18n._(msg`settings.player.danmakuSpeed`)}
                </Label>
                <SelectorGroup
                  options={speedOptions}
                  value={danmakuSpeed}
                  onChange={(v) => save({ speed: v })}
                />
              </div>

              {/* Danmaku density selector */}
              <div className="space-y-2">
                <Label className="text-sm text-mm-text-secondary">
                  {i18n._(msg`settings.player.danmakuDensity`)}
                </Label>
                <SelectorGroup
                  options={[
                    { label: i18n._(msg`settings.player.density.low`), value: 'low' as const },
                    { label: i18n._(msg`settings.player.density.medium`), value: 'medium' as const },
                    { label: i18n._(msg`settings.player.density.high`), value: 'high' as const },
                  ]}
                  value={danmakuDensity}
                  onChange={(v) => updatePreference('danmakuDensity', v)}
                />
              </div>
            </div>
          </div>
        </SettingsCard>

        {/* ── Buffer Mode ── */}
        <SettingsCard label={i18n._(msg`settings.player.bufferMode`)}>
          <div className="space-y-2">
            <SelectorGroup
              options={[
                { label: i18n._(msg`settings.player.buffer.auto`), value: 'auto' as const },
                { label: i18n._(msg`settings.player.buffer.low`), value: 'low' as const },
                { label: i18n._(msg`settings.player.buffer.balanced`), value: 'balanced' as const },
                { label: i18n._(msg`settings.player.buffer.high`), value: 'high' as const },
              ]}
              value={bufferMode}
              onChange={(v) => updatePreference('bufferMode', v)}
            />
            <p className="text-xs text-mm-text-tertiary">
              {i18n._(msg`settings.player.bufferModeDesc`)}
            </p>
          </div>
        </SettingsCard>

        <KeyBindingPanel />

        {/* ── Subtitle Style ── */}
        <SettingsCard label={i18n._(msg`settings.player.subtitleStyle`)}>
          <div className="space-y-4">
            {/* Preset selector */}
            <div className="space-y-2">
              <Label className="text-sm text-mm-text-secondary">
                {i18n._(msg`settings.player.subtitlePreset`)}
              </Label>
              <SelectorGroup
                options={PRESET_OPTIONS}
                value={subtitlePreset}
                onChange={applyPreset}
              />
            </div>

            {/* Font family */}
            <div className="space-y-2">
              <Label className="text-sm text-mm-text-secondary">
                {i18n._(msg`settings.player.subtitleFont`)}
              </Label>
              <select
                value={subtitleStyle.fontFamily}
                onChange={(e) => updateSubtitleStyle({ fontFamily: e.target.value })}
                className="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-1.5 text-sm text-white outline-none focus:border-white/[0.12]"
              >
                {SUBTITLE_FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Font size */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-mm-text-secondary">
                  {i18n._(msg`settings.player.subtitleFontSize`)}
                </Label>
                <span className="text-xs text-mm-text-tertiary tabular-nums">
                  {subtitleStyle.fontSize}px
                </span>
              </div>
              <RangeSlider
                min={12}
                max={48}
                value={subtitleStyle.fontSize}
                onChange={(v) => updateSubtitleStyle({ fontSize: v })}
              />
            </div>

            {/* Text color */}
            <div className="space-y-2">
              <Label className="text-sm text-mm-text-secondary">
                {i18n._(msg`settings.player.subtitleColor`)}
              </Label>
              <div className="flex items-center gap-2">
                {COLOR_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.value}
                    type="button"
                    title={swatch.label}
                    onClick={() => updateSubtitleStyle({ color: swatch.value })}
                    className={cn(
                      'size-7 rounded-full border-2 transition-all',
                      subtitleStyle.color === swatch.value
                        ? 'border-white/60 scale-110'
                        : 'border-white/10 hover:border-white/30',
                    )}
                    style={{ backgroundColor: swatch.value }}
                  />
                ))}
                <label className="relative ml-1 cursor-pointer">
                  <input
                    type="color"
                    value={subtitleStyle.color}
                    onChange={(e) => updateSubtitleStyle({ color: e.target.value })}
                    className="absolute inset-0 size-7 cursor-pointer opacity-0"
                  />
                  <div
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full border-2 border-dashed border-white/20 text-xs text-white/40',
                      !COLOR_SWATCHES.some((s) => s.value === subtitleStyle.color) && 'border-white/60',
                    )}
                    style={
                      !COLOR_SWATCHES.some((s) => s.value === subtitleStyle.color)
                        ? { backgroundColor: subtitleStyle.color }
                        : undefined
                    }
                  >
                    {COLOR_SWATCHES.some((s) => s.value === subtitleStyle.color) ? '+' : ''}
                  </div>
                </label>
              </div>
            </div>

            {/* Background opacity */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-mm-text-secondary">
                  {i18n._(msg`settings.player.subtitleBgOpacity`)}
                </Label>
                <span className="text-xs text-mm-text-tertiary tabular-nums">
                  {Math.round(subtitleStyle.backgroundOpacity * 100)}%
                </span>
              </div>
              <RangeSlider
                min={0}
                max={100}
                value={Math.round(subtitleStyle.backgroundOpacity * 100)}
                onChange={(v) => updateSubtitleStyle({ backgroundOpacity: v / 100 })}
              />
            </div>

            {/* Border style (shadow type) */}
            <div className="space-y-2">
              <Label className="text-sm text-mm-text-secondary">
                {i18n._(msg`settings.player.subtitleBorder`)}
              </Label>
              <SelectorGroup
                options={SHADOW_TYPE_OPTIONS}
                value={subtitleStyle.shadowType}
                onChange={(v) => updateSubtitleStyle({ shadowType: v })}
              />
            </div>

            {/* Stroke width — visible when shadow type is not "none" */}
            {subtitleStyle.shadowType !== 'none' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-mm-text-secondary">
                    {i18n._(msg`settings.player.subtitleStrokeWidth`)}
                  </Label>
                  <span className="text-xs text-mm-text-tertiary tabular-nums">
                    {subtitleStyle.strokeWidth}px
                  </span>
                </div>
                <RangeSlider
                  min={0}
                  max={4}
                  step={0.5}
                  value={subtitleStyle.strokeWidth}
                  onChange={(v) => updateSubtitleStyle({ strokeWidth: v })}
                />
              </div>
            )}

            {/* Position */}
            <div className="space-y-2">
              <Label className="text-sm text-mm-text-secondary">
                {i18n._(msg`settings.player.subtitlePosition`)}
              </Label>
              <SelectorGroup
                options={POSITION_OPTIONS}
                value={subtitleStyle.position}
                onChange={(v) => updateSubtitleStyle({ position: v })}
              />
            </div>

            {/* Safe margin */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-mm-text-secondary">
                  {i18n._(msg`settings.player.subtitleSafeMargin`)}
                </Label>
                <span className="text-xs text-mm-text-tertiary tabular-nums">
                  {subtitleStyle.safeMargin}%
                </span>
              </div>
              <RangeSlider
                min={0}
                max={20}
                value={subtitleStyle.safeMargin}
                onChange={(v) => updateSubtitleStyle({ safeMargin: v })}
              />
            </div>

            {/* Fade animation */}
            <div className="flex items-center justify-between">
              <Label className="text-sm text-mm-text-secondary">
                {i18n._(msg`settings.player.subtitleFade`)}
              </Label>
              <Switch
                checked={subtitleStyle.fadeAnimation}
                onCheckedChange={(checked) => updateSubtitleStyle({ fadeAnimation: checked })}
              />
            </div>

            {/* Respect ASS styles */}
            <div className="flex items-center justify-between">
              <Label className="text-sm text-mm-text-secondary">
                {i18n._(msg`settings.player.subtitleRespectAss`)}
              </Label>
              <Switch
                checked={subtitleStyle.respectAssStyle}
                onCheckedChange={(checked) => updateSubtitleStyle({ respectAssStyle: checked })}
              />
            </div>

            {/* Live preview */}
            <div className="space-y-1">
              <Label className="text-xs text-mm-text-tertiary">
                {i18n._(msg`settings.player.subtitlePreview`)}
              </Label>
              <SubtitlePreview style={subtitleStyle} />
            </div>
          </div>
        </SettingsCard>

        {/* ── Gesture Controls ── */}
        <SettingsCard label={i18n._(msg`settings.player.gestures`)}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-mm-text-secondary">
                {i18n._(msg`settings.player.gestureEnabled`)}
              </Label>
              <Switch
                checked={gestureEnabled}
                onCheckedChange={(checked) => updatePreference('gestureEnabled', checked)}
              />
            </div>

            <div className={cn('space-y-2', !gestureEnabled && 'opacity-50 pointer-events-none')}>
              <div className="flex items-center justify-between">
                <Label className="text-sm text-mm-text-secondary">
                  {i18n._(msg`settings.player.gestureSensitivity`)}
                </Label>
                <span className="text-xs text-mm-text-tertiary tabular-nums">
                  {gestureSensitivity}
                </span>
              </div>
              <RangeSlider
                min={1}
                max={100}
                value={gestureSensitivity}
                onChange={(v) => updatePreference('gestureSensitivity', v)}
              />
            </div>
          </div>
        </SettingsCard>

        {/* ── Playback Defaults ── */}
        <SettingsCard label={i18n._(msg`settings.player.playbackDefaults`)}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-mm-text-secondary">
                {i18n._(msg`settings.player.autoNext`)}
              </Label>
              <Switch
                checked={autoNext}
                onCheckedChange={(checked) => updatePreference('autoNext', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm text-mm-text-secondary">
                {i18n._(msg`settings.player.autoSkipOp`)}
              </Label>
              <Switch
                checked={autoSkipOp}
                onCheckedChange={(checked) => updatePreference('autoSkipOp', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm text-mm-text-secondary">
                {i18n._(msg`settings.player.autoSkipEd`)}
              </Label>
              <Switch
                checked={autoSkipEd}
                onCheckedChange={(checked) => updatePreference('autoSkipEd', checked)}
              />
            </div>
          </div>
        </SettingsCard>

        {/* ── Backup note ── */}
        <div className="px-1 py-2 text-xs text-mm-text-tertiary">
          {i18n._(msg`settings.player.backupNote`)}
        </div>
      </div>
    </div>
  );
}
