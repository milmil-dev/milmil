import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SelectorGroup } from '@/components/settings/SelectorGroup';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Switch } from '@/components/ui/switch';
import { availableLanguages, detectBrowserLocale, loadAndActivate } from '@/i18n/config';
import { api } from '@/lib/api-client';
import { type Theme, useTheme } from '@/lib/theme-context';
import { useUIStore, type WeekStartDay } from '@/store/ui-store';

export function GeneralPanel() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const weekStartDay = useUIStore((s) => s.weekStartDay);
  const setWeekStartDay = useUIStore((s) => s.setWeekStartDay);
  const { theme, setTheme } = useTheme();

  const [currentLang, setCurrentLang] = useState(
    () => localStorage.getItem('milmil-locale') ?? detectBrowserLocale()
  );

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, any>>('/api/v1/settings'),
  });

  const [autoAdd, setAutoAdd] = useState(true);

  useEffect(() => {
    const language = settings?.appearance?.language;
    if (!language || language === currentLang) return;
    if (!availableLanguages.some((l) => l.code === language)) return;
    setCurrentLang(language);
    localStorage.setItem('milmil-locale', language);
    loadAndActivate(language);
  }, [settings?.appearance?.language, currentLang]);

  useEffect(() => {
    const serverTheme = settings?.appearance?.theme;
    if (!serverTheme || serverTheme === theme) return;
    if (serverTheme !== 'system' && serverTheme !== 'light' && serverTheme !== 'dark') return;
    setTheme(serverTheme);
  }, [settings?.appearance?.theme, theme, setTheme]);

  useEffect(() => {
    if (settings?.collection) {
      setAutoAdd(settings.collection.auto_add_to_collection ?? true);
    }
  }, [settings?.collection]);

  const updateAppearanceSettings = useMutation({
    mutationFn: (data: { language?: string; theme?: Theme }) =>
      api.put('/api/v1/settings/appearance', {
        ...settings?.appearance,
        ...data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error(i18n._(msg`settings.saveFailed`)),
  });

  const updateCollectionSettings = useMutation({
    mutationFn: (data: { auto_add_to_collection: boolean }) =>
      api.put('/api/v1/settings/collection', data),
    onSuccess: () => {
      toast.success(i18n._(msg`settings.saved`));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error(i18n._(msg`settings.saveFailed`)),
  });

  const handleLanguageChange = async (code: string) => {
    setCurrentLang(code);
    localStorage.setItem('milmil-locale', code);
    await loadAndActivate(code);
    updateAppearanceSettings.mutate({ language: code });
    toast.success(i18n._(msg`settings.saved`));
  };

  const handleThemeChange = (value: string) => {
    const next = value as Theme;
    setTheme(next);
    updateAppearanceSettings.mutate({ theme: next });
    toast.success(i18n._(msg`settings.saved`));
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink sm:text-xl">
        {i18n._(msg`settings.nav.general`)}
      </h2>
      <p className="mt-1 mb-4 text-xs text-ink/35 sm:mb-6">
        {i18n._(msg`settings.general.subtitle`)}
      </p>

      <div className="space-y-3">
        <SettingsCard label={i18n._(msg`settings.appearance.language`)}>
          <SelectorGroup
            options={availableLanguages.map((l) => ({ label: l.label, value: l.code }))}
            value={currentLang}
            onChange={handleLanguageChange}
          />
        </SettingsCard>

        <SettingsCard label={i18n._(msg`settings.appearance.theme`)}>
          <SelectorGroup
            options={[
              { label: i18n._(msg`settings.theme.dark`), value: 'dark' },
              { label: i18n._(msg`settings.theme.light`), value: 'light' },
              { label: i18n._(msg`settings.theme.system`), value: 'system' },
            ]}
            value={theme}
            onChange={handleThemeChange}
          />
        </SettingsCard>

        <SettingsCard label={i18n._(msg`settings.weekStartDay`)}>
          <SelectorGroup
            options={[
              { label: i18n._(msg`settings.weekStartDay.monday`), value: 'monday' },
              { label: i18n._(msg`settings.weekStartDay.sunday`), value: 'sunday' },
              { label: i18n._(msg`settings.weekStartDay.saturday`), value: 'saturday' },
            ]}
            value={weekStartDay}
            onChange={(v) => setWeekStartDay(v as WeekStartDay)}
          />
        </SettingsCard>

        <SettingsCard label={i18n._(msg`settings.collection`)}>
          <div className="flex flex-col gap-3 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between">
            <div className="min-w-0">
              <p className="text-[13px] text-ink/85">{i18n._(msg`settings.autoAddToCollection`)}</p>
              <p className="mt-0.5 text-[11px] text-ink/30">
                {i18n._(msg`settings.autoAddToCollectionDesc`)}
              </p>
            </div>
            <Switch
              className="shrink-0"
              checked={autoAdd}
              onCheckedChange={(checked) => {
                setAutoAdd(checked);
                updateCollectionSettings.mutate({ auto_add_to_collection: checked });
              }}
            />
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
