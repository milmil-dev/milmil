import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { SelectorGroup } from '@/components/settings/SelectorGroup';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
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

  const form = useForm({
    defaultValues: {
      enabled: danmakuEnabled,
      opacity: Math.round(danmakuOpacity * 100),
      fontSize: danmakuFontSize,
      speed: danmakuSpeed,
    },
    onSubmit: async ({ value }) => {
      await saveMutation.mutateAsync({
        danmaku_enabled: value.enabled,
        danmaku_opacity: value.opacity / 100,
        danmaku_font_size: value.fontSize,
        danmaku_speed: value.speed,
      });
    },
  });

  useEffect(() => {
    form.reset({
      enabled: danmakuEnabled,
      opacity: Math.round(danmakuOpacity * 100),
      fontSize: danmakuFontSize,
      speed: danmakuSpeed,
    });
  }, [danmakuEnabled, danmakuOpacity, danmakuFontSize, danmakuSpeed, form.reset]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <h2 className="text-[18px] font-bold text-white">{i18n._(msg`settings.nav.player`)}</h2>
      <p className="mt-1 mb-6 text-[11px] text-white/35">{i18n._(msg`settings.player.subtitle`)}</p>

      <div className="max-w-3xl space-y-3">
        <SettingsCard label={i18n._(msg`settings.player.danmaku`)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
            className="space-y-4"
          >
            {/* Danmaku enabled toggle */}
            <form.Field name="enabled">
              {(field) => (
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-mm-text-secondary">
                    {i18n._(msg`settings.player.danmakuEnabled`)}
                  </Label>
                  <Switch
                    checked={field.state.value}
                    onCheckedChange={(checked) => field.handleChange(checked)}
                  />
                </div>
              )}
            </form.Field>

            {/* Remaining controls — disabled when danmaku is off */}
            <form.Subscribe selector={(s) => s.values.enabled}>
              {(enabled) => (
                <div className={cn('space-y-4', !enabled && 'opacity-50 pointer-events-none')}>
                  {/* Opacity slider */}
                  <form.Field name="opacity">
                    {(field) => (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm text-mm-text-secondary">
                            {i18n._(msg`settings.player.danmakuOpacity`)}
                          </Label>
                          <span className="text-xs text-mm-text-tertiary tabular-nums">
                            {field.state.value}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(Number(e.target.value))}
                          className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-mm-accent"
                          style={{
                            background: `linear-gradient(to right, var(--mm-accent) ${String(field.state.value)}%, oklch(18% 0.01 280) ${String(field.state.value)}%)`,
                          }}
                        />
                      </div>
                    )}
                  </form.Field>

                  {/* Font size selector */}
                  <form.Field name="fontSize">
                    {(field) => (
                      <div className="space-y-2">
                        <Label className="text-sm text-mm-text-secondary">
                          {i18n._(msg`settings.player.danmakuFontSize`)}
                        </Label>
                        <SelectorGroup
                          options={[...FONT_SIZE_OPTIONS]}
                          value={field.state.value}
                          onChange={(v) => field.handleChange(v)}
                        />
                      </div>
                    )}
                  </form.Field>

                  {/* Speed selector */}
                  <form.Field name="speed">
                    {(field) => (
                      <div className="space-y-2">
                        <Label className="text-sm text-mm-text-secondary">
                          {i18n._(msg`settings.player.danmakuSpeed`)}
                        </Label>
                        <SelectorGroup
                          options={speedOptions}
                          value={field.state.value}
                          onChange={(v) => field.handleChange(v)}
                        />
                      </div>
                    )}
                  </form.Field>
                </div>
              )}
            </form.Subscribe>

            {/* Save button */}
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  disabled={saveMutation.isPending || isSubmitting}
                  className="font-bold text-black bg-mm-accent"
                >
                  {saveMutation.isPending || isSubmitting
                    ? i18n._(msg`settings.saving`)
                    : i18n._(msg`settings.save`)}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </SettingsCard>
      </div>
    </motion.div>
  );
}
