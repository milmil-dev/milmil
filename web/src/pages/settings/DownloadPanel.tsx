import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';

import { ConnectionBadge } from '@/components/settings/ConnectionBadge';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { api } from '@/lib/api-client';

interface DownloaderStatus {
  engine: string;
  healthy: boolean;
}

export function DownloadPanel() {
  const { i18n } = useLingui();

  const { data: status } = useQuery({
    queryKey: ['system', 'downloader-status'],
    queryFn: () => api.get<DownloaderStatus>('/api/v1/system/downloader-status'),
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-5">
      {/* Downloader Status */}
      <SettingsCard label={i18n._(msg`settings.download.engine`)}>
        <div className="flex items-center justify-between">
          <ConnectionBadge
            connected={status?.healthy ?? false}
            connectedText={status?.engine === 'builtin' ? i18n._(msg`settings.download.builtin`) : (status?.engine ?? '')}
            disconnectedText={i18n._(msg`settings.download.disconnected`)}
          />
        </div>
        <p className="text-[12px] text-white/30 mt-3">
          {i18n._(msg`settings.download.builtinDesc`)}
        </p>
      </SettingsCard>

      {/* Preferences */}
      <SettingsCard label={i18n._(msg`settings.download.preferences`)}>
        <AutoDeleteFilesSwitch />
      </SettingsCard>
    </div>
  );
}

// ── Auto-delete files switch ────────────────────────────────────────────

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';

function AutoDeleteFilesSwitch() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, any>>('/api/v1/settings'),
  });

  const [autoDelete, setAutoDelete] = useState(false);

  useEffect(() => {
    if (settings?.download?.auto_delete_files != null) {
      setAutoDelete(settings.download.auto_delete_files);
    }
  }, [settings?.download?.auto_delete_files]);

  const mutation = useMutation({
    mutationFn: (value: boolean) =>
      api.put('/api/v1/settings/download', { auto_delete_files: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-[13px] text-white/60">
        {i18n._(msg`settings.download.autoDeleteFiles`)}
      </span>
      <Switch
        checked={autoDelete}
        onCheckedChange={(v) => {
          setAutoDelete(v);
          mutation.mutate(v);
        }}
      />
    </label>
  );
}
