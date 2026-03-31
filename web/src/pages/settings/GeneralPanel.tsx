import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SelectorGroup } from '@/components/settings/SelectorGroup';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Switch } from '@/components/ui/switch';
import { availableLanguages, loadAndActivate } from '@/i18n/config';
import { api } from '@/lib/api-client';

export function GeneralPanel() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const [currentLang, setCurrentLang] = useState(
    () => localStorage.getItem('milmil-locale') ?? 'zh-Hant'
  );

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, any>>('/api/v1/settings'),
  });

  const [autoAdd, setAutoAdd] = useState(true);

  useEffect(() => {
    if (settings?.collection) {
      setAutoAdd(settings.collection.auto_add_to_collection ?? true);
    }
  }, [settings?.collection]);

  const updateCollectionSettings = useMutation({
    mutationFn: (data: { auto_add_to_collection: boolean }) =>
      api.put('/api/v1/settings/collection', data),
    onSuccess: () => {
      toast.success(i18n._(msg`settings.saved`));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error(i18n._(msg`settings.saveFailed`)),
  });

  const handleLanguageChange = (code: string) => {
    setCurrentLang(code);
    localStorage.setItem('milmil-locale', code);
    loadAndActivate(code);
    toast.success(i18n._(msg`settings.saved`));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <h2 className="text-[18px] font-bold text-white">
        {i18n._(msg`settings.nav.general`)}
      </h2>
      <p className="mt-1 mb-6 text-[11px] text-white/35">
        {i18n._(msg`settings.general.subtitle`)}
      </p>

      <div className="max-w-2xl space-y-3">
        <SettingsCard label={i18n._(msg`settings.appearance.language`)}>
          <SelectorGroup
            options={availableLanguages.map((l) => ({ label: l.label, value: l.code }))}
            value={currentLang}
            onChange={handleLanguageChange}
          />
        </SettingsCard>

        <SettingsCard label={i18n._(msg`settings.collection`)}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] text-white/85">
                {i18n._(msg`settings.autoAddToCollection`)}
              </p>
              <p className="mt-0.5 text-[10px] text-white/30">
                {i18n._(msg`settings.autoAddToCollectionDesc`)}
              </p>
            </div>
            <Switch
              checked={autoAdd}
              onCheckedChange={(checked) => {
                setAutoAdd(checked);
                updateCollectionSettings.mutate({ auto_add_to_collection: checked });
              }}
            />
          </div>
        </SettingsCard>
      </div>
    </motion.div>
  );
}
