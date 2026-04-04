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
import { usePlayerStore } from '@/store/player-store';

const FONT_SIZE_OPTIONS = [
  { label: '16px', value: 16 },
  { label: '20px', value: 20 },
  { label: '24px', value: 24 },
] as const;

export function PlayerPanel() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const speedOptions = [
    { label: i18n._(msg`settings.player.speed.slow`), value: 96 },
    { label: i18n._(msg`settings.player.speed.normal`), value: 144 },
    { label: i18n._(msg`settings.player.speed.fast`), value: 200 },
  ];

  const danmakuEnabled = usePlayerStore((s) => s.danmakuEnabled);
  const danmakuOpacity = usePlayerStore((s) => s.danmakuOpacity);
  const danmakuFontSize = usePlayerStore((s) => s.danmakuFontSize);
  const danmakuSpeed = usePlayerStore((s) => s.danmakuSpeed);

  const saveMutation = useMutation({
    mutationFn: (data: {
      danmaku_enabled: boolean;
      danmaku_opacity: number;
      danmaku_font_size: number;
      danmaku_speed: number;
    }) => api.put('/api/v1/settings/player', data),
    onSuccess: (_data, variables) => {
      const store = usePlayerStore.getState();
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
    const store = usePlayerStore.getState();
    saveMutation.mutate({
      danmaku_enabled: overrides.enabled ?? store.danmakuEnabled,
      danmaku_opacity: overrides.opacity != null ? overrides.opacity / 100 : store.danmakuOpacity,
      danmaku_font_size: overrides.fontSize ?? store.danmakuFontSize,
      danmaku_speed: overrides.speed ?? store.danmakuSpeed,
    });
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-white">{i18n._(msg`settings.nav.player`)}</h2>
      <p className="mt-1 mb-6 text-xs text-white/35">{i18n._(msg`settings.player.subtitle`)}</p>

      <div className="space-y-3">
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
                    usePlayerStore.getState().setDanmakuOpacity(Number(e.target.value) / 100);
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
            </div>
          </div>
        </SettingsCard>

        <KeyBindingPanel />
      </div>
    </div>
  );
}
