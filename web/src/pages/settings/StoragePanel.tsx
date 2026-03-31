import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useState } from 'react';
import { toast } from 'sonner';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { api } from '@/lib/api-client';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface StorageStats {
  total_size: number;
  file_count: number;
}

export function StoragePanel() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [showClearDialog, setShowClearDialog] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ['system', 'storage'],
    queryFn: () => api.get<StorageStats>('/api/v1/system/storage'),
  });

  const clearMutation = useMutation({
    mutationFn: () => api.delete('/api/v1/system/transcode-cache'),
    onSuccess: () => {
      toast.success(i18n._(msg`settings.storage.cleared`));
      queryClient.invalidateQueries({ queryKey: ['system', 'storage'] });
      setShowClearDialog(false);
    },
    onError: () => toast.error(i18n._(msg`settings.storage.clearFailed`)),
  });

  const totalSize = stats?.total_size ?? 0;
  const fileCount = stats?.file_count ?? 0;

  return (
    <div>
      <h2 className="text-[18px] font-bold text-white">
        {i18n._(msg`settings.nav.storage`)}
      </h2>
      <p className="mt-1 mb-6 text-[11px] text-white/35">
        {i18n._(msg`settings.storage.subtitle`)}
      </p>

      <div className="max-w-3xl space-y-3">
        <SettingsCard label={i18n._(msg`settings.storage.diskUsage`)}>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[20px] font-bold text-white tabular-nums">
                {formatBytes(totalSize)}
              </span>
              <span className="text-[11px] text-white/30">
                {fileCount} {i18n._(msg`settings.storage.files`)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-mm-accent transition-all"
                style={{ width: totalSize > 0 ? '100%' : '0%' }}
              />
            </div>
            <p className="text-[10px] text-white/25">
              {i18n._(msg`settings.storage.transcodeDesc`)}
            </p>
          </div>
        </SettingsCard>

        <SettingsCard label={i18n._(msg`settings.storage.actions`)}>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowClearDialog(true)}
            disabled={fileCount === 0}
            className="font-bold border-white/[0.1] text-red-400 hover:bg-white/[0.05]"
          >
            {i18n._(msg`settings.storage.clearTranscode`)}
          </Button>
        </SettingsCard>
      </div>

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {i18n._(msg`settings.storage.clearConfirmTitle`)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {i18n._(msg`settings.storage.clearConfirmDesc`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{i18n._(msg`common.cancel`)}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearMutation.mutate()}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              {clearMutation.isPending
                ? i18n._(msg`settings.storage.clearing`)
                : i18n._(msg`settings.storage.clearTranscode`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
