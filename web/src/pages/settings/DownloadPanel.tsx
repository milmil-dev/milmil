import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { ConnectionBadge } from '@/components/settings/ConnectionBadge';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { api } from '@/lib/api-client';

const INPUT_CLASS = 'bg-transparent border-white/[0.08] focus:border-mm-accent text-white';

interface Aria2Status {
  connected: boolean;
  version?: string;
  rpc_url: string;
  error?: string;
}

export function DownloadPanel() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const { data: aria2Status, refetch: refetchStatus } = useQuery({
    queryKey: ['system', 'aria2-status'],
    queryFn: () => api.get<Aria2Status>('/api/v1/system/aria2-status'),
    refetchInterval: 30000,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, any>>('/api/v1/settings'),
  });

  const form = useForm({
    defaultValues: { rpc_url: 'http://localhost:6800/jsonrpc', rpc_secret: '', default_save_dir: '/downloads' },
    onSubmit: async ({ value }) => {
      await saveMutation.mutateAsync(value);
    },
  });

  useEffect(() => {
    if (settings?.download) {
      form.reset({
        rpc_url: settings.download.rpc_url ?? '',
        rpc_secret: settings.download.rpc_secret ?? '',
        default_save_dir: settings.download.default_save_dir ?? '/downloads',
      });
    }
  }, [settings?.download]);

  const saveMutation = useMutation({
    mutationFn: (data: { rpc_url: string; rpc_secret: string; default_save_dir: string }) =>
      api.put('/api/v1/settings/download', data),
    onSuccess: () => {
      toast.success(i18n._(msg`settings.saved`));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      refetchStatus();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testMutation = useMutation({
    mutationFn: () => refetchStatus().then((r) => r.data),
    onSuccess: (data) => {
      if (data?.connected) {
        toast.success(`Aria2 v${data.version} connected`);
      } else {
        toast.error(`Connection failed: ${data?.error || 'Unknown error'}`);
      }
    },
  });

  return (
    <div className="space-y-5">
      {/* Aria2 Connection */}
      <SettingsCard label={i18n._(msg`settings.download.aria2`)}>
        <div className="flex items-center justify-between mb-4">
          <ConnectionBadge
            connected={aria2Status?.connected ?? false}
            connectedText={`Aria2 v${aria2Status?.version ?? '?'}`}
            disconnectedText={i18n._(msg`settings.download.disconnected`)}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="text-[11px]"
          >
            {i18n._(msg`settings.download.test`)}
          </Button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-3"
        >
          <form.Field name="rpc_url">
            {(field) => (
              <Field>
                <FieldLabel className="text-white/50 text-xs">
                  {i18n._(msg`settings.download.rpcUrl`)}
                </FieldLabel>
                <Input
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="http://localhost:6800/jsonrpc"
                  className={INPUT_CLASS}
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="rpc_secret">
            {(field) => (
              <Field>
                <FieldLabel className="text-white/50 text-xs">
                  {i18n._(msg`settings.download.rpcSecret`)}
                </FieldLabel>
                <PasswordInput
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="••••••••"
                  className={INPUT_CLASS}
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="default_save_dir">
            {(field) => (
              <Field>
                <FieldLabel className="text-white/50 text-xs">
                  {i18n._(msg`settings.download.saveDir`)}
                </FieldLabel>
                <Input
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="/downloads"
                  className={INPUT_CLASS}
                />
              </Field>
            )}
          </form.Field>

          <Button
            type="submit"
            disabled={saveMutation.isPending}
            className="w-full font-semibold text-white bg-white/[0.08] hover:bg-white/[0.14]"
          >
            {saveMutation.isPending ? '...' : i18n._(msg`settings.save`)}
          </Button>
        </form>
      </SettingsCard>

      {/* How it works */}
      <SettingsCard label={i18n._(msg`settings.download.howItWorks`)}>
        <div className="space-y-3 text-[13px] text-white/50 leading-relaxed">
          <p>{i18n._(msg`settings.download.guide.1`)}</p>
          <p>{i18n._(msg`settings.download.guide.2`)}</p>
          <p>{i18n._(msg`settings.download.guide.3`)}</p>
        </div>
      </SettingsCard>
    </div>
  );
}
