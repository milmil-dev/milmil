import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const INPUT_CLASS = 'bg-transparent border-white/[0.08] focus:border-mm-accent text-white';

// ─── Types ──────────────────────────────────────────────────────────────────

interface BackupConfigPayload {
  url?: string;
  username?: string;
  password?: string;
  endpoint?: string;
  bucket?: string;
  access_key?: string;
  secret_key?: string;
  region?: string;
}

interface BackupConfigResponse {
  id: string;
  type: string;
  config: BackupConfigPayload;
  enabled: boolean;
  last_sync_at: string | null;
}

interface SyncStatusEntry {
  type: string;
  enabled: boolean;
  last_sync_at: string | null;
}

interface SyncResultEntry {
  type: string;
  status: string;
  message?: string;
}

interface TestResult {
  ok: boolean;
  error?: string;
}

// ─── JSON Export/Import Card ────────────────────────────────────────────────

function JsonExportImportCard() {
  const { i18n } = useLingui();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportMutation = useMutation({
    mutationFn: () =>
      api.post<{ version: number; preferences: unknown[]; exported_at: string }>(
        '/api/v1/user/preferences/export'
      ),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `milmil-preferences-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(i18n._(msg`backup.exportSuccess`));
    },
    onError: () => toast.error(i18n._(msg`backup.exportFailed`)),
  });

  const importMutation = useMutation({
    mutationFn: (body: unknown) => api.post<void>('/api/v1/user/preferences/import', body),
    onSuccess: () => {
      toast.success(i18n._(msg`backup.importSuccess`));
    },
    onError: () => toast.error(i18n._(msg`backup.importFailed`)),
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (parsed.version !== 1 || !Array.isArray(parsed.preferences)) {
          toast.error(i18n._(msg`backup.invalidFile`));
          return;
        }
        importMutation.mutate(parsed);
      } catch {
        toast.error(i18n._(msg`backup.invalidFile`));
      }
    };
    reader.readAsText(file);

    // Reset so the same file can be selected again
    e.target.value = '';
  };

  return (
    <SettingsCard label={i18n._(msg`backup.jsonExportImport`)}>
      <FieldDescription className="mb-4">{i18n._(msg`backup.jsonDescription`)}</FieldDescription>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
        >
          {exportMutation.isPending ? <Spinner className="mr-1.5" /> : null}
          {i18n._(msg`backup.export`)}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={importMutation.isPending}
        >
          {importMutation.isPending ? <Spinner className="mr-1.5" /> : null}
          {i18n._(msg`backup.import`)}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    </SettingsCard>
  );
}

// ─── WebDAV Config Card ─────────────────────────────────────────────────────

function WebDAVConfigCard() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const { data: configs } = useQuery({
    queryKey: ['backup-configs'],
    queryFn: () => api.get<BackupConfigResponse[]>('/api/v1/user/preferences/backup-config'),
  });

  const existing = configs?.find((c) => c.type === 'webdav');

  const form = useForm({
    defaultValues: {
      url: existing?.config.url ?? '',
      username: existing?.config.username ?? '',
      password: '',
      enabled: existing?.enabled ?? false,
    },
    onSubmit: async ({ value }) => {
      await saveMutation.mutateAsync(value);
    },
  });

  useEffect(() => {
    if (existing) {
      form.reset({
        url: existing.config.url ?? '',
        username: existing.config.username ?? '',
        password: '',
        enabled: existing.enabled,
      });
    }
  }, [existing?.id]);

  const saveMutation = useMutation({
    mutationFn: (value: { url: string; username: string; password: string; enabled: boolean }) =>
      api.put('/api/v1/user/preferences/backup-config', {
        type: 'webdav',
        config: {
          url: value.url,
          username: value.username,
          password: value.password,
        },
        enabled: value.enabled,
      }),
    onSuccess: () => {
      toast.success(i18n._(msg`settings.saved`));
      queryClient.invalidateQueries({ queryKey: ['backup-configs'] });
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
    },
    onError: () => toast.error(i18n._(msg`settings.saveFailed`)),
  });

  const testMutation = useMutation({
    mutationFn: () => {
      const state = form.state.values;
      return api.post<TestResult>('/api/v1/user/preferences/backup-config/test', {
        type: 'webdav',
        config: {
          url: state.url,
          username: state.username,
          password: state.password,
        },
      });
    },
    onSuccess: (data) => {
      if (data.ok) {
        toast.success(i18n._(msg`backup.connectionOk`));
      } else {
        toast.error(data.error ?? i18n._(msg`backup.connectionFailed`));
      }
    },
    onError: () => toast.error(i18n._(msg`backup.connectionFailed`)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete<void>('/api/v1/user/preferences/backup-config/webdav'),
    onSuccess: () => {
      toast.success(i18n._(msg`backup.configDeleted`));
      queryClient.invalidateQueries({ queryKey: ['backup-configs'] });
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
      form.reset({ url: '', username: '', password: '', enabled: false });
    },
    onError: () => toast.error(i18n._(msg`backup.deleteFailed`)),
  });

  return (
    <SettingsCard label="WebDAV">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <form.Field name="url">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="webdav-url">URL</FieldLabel>
              <Input
                id="webdav-url"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="https://dav.example.com/remote.php/webdav"
                className={INPUT_CLASS}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="username">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="webdav-username">{i18n._(msg`backup.username`)}</FieldLabel>
              <Input
                id="webdav-username"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={i18n._(msg`backup.username`)}
                className={INPUT_CLASS}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="webdav-password">{i18n._(msg`backup.password`)}</FieldLabel>
              <PasswordInput
                id="webdav-password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={existing ? '********' : i18n._(msg`backup.password`)}
                className={INPUT_CLASS}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="enabled">
          {(field) => (
            <div className="flex items-center justify-between">
              <Label className="text-sm text-mm-text-secondary">
                {i18n._(msg`backup.enabled`)}
              </Label>
              <Switch
                checked={field.state.value}
                onCheckedChange={(checked) => field.handleChange(checked)}
              />
            </div>
          )}
        </form.Field>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending ? <Spinner className="mr-1.5" /> : null}
            {i18n._(msg`backup.testConnection`)}
          </Button>

          {existing && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              size="sm"
            >
              {i18n._(msg`backup.delete`)}
            </Button>
          )}

          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={saveMutation.isPending || isSubmitting}>
                {saveMutation.isPending || isSubmitting
                  ? i18n._(msg`settings.saving`)
                  : i18n._(msg`settings.save`)}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </SettingsCard>
  );
}

// ─── S3 Config Card ─────────────────────────────────────────────────────────

function S3ConfigCard() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const { data: configs } = useQuery({
    queryKey: ['backup-configs'],
    queryFn: () => api.get<BackupConfigResponse[]>('/api/v1/user/preferences/backup-config'),
  });

  const existing = configs?.find((c) => c.type === 's3');

  const form = useForm({
    defaultValues: {
      endpoint: existing?.config.endpoint ?? '',
      bucket: existing?.config.bucket ?? '',
      access_key: existing?.config.access_key ?? '',
      secret_key: '',
      region: existing?.config.region ?? '',
      enabled: existing?.enabled ?? false,
    },
    onSubmit: async ({ value }) => {
      await saveMutation.mutateAsync(value);
    },
  });

  const saveMutation = useMutation({
    mutationFn: (value: {
      endpoint: string;
      bucket: string;
      access_key: string;
      secret_key: string;
      region: string;
      enabled: boolean;
    }) =>
      api.put('/api/v1/user/preferences/backup-config', {
        type: 's3',
        config: {
          endpoint: value.endpoint,
          bucket: value.bucket,
          access_key: value.access_key,
          secret_key: value.secret_key,
          region: value.region,
        },
        enabled: value.enabled,
      }),
    onSuccess: () => {
      toast.success(i18n._(msg`settings.saved`));
      queryClient.invalidateQueries({ queryKey: ['backup-configs'] });
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
    },
    onError: () => toast.error(i18n._(msg`settings.saveFailed`)),
  });

  const testMutation = useMutation({
    mutationFn: () => {
      const state = form.state.values;
      return api.post<TestResult>('/api/v1/user/preferences/backup-config/test', {
        type: 's3',
        config: {
          endpoint: state.endpoint,
          bucket: state.bucket,
          access_key: state.access_key,
          secret_key: state.secret_key,
          region: state.region,
        },
      });
    },
    onSuccess: (data) => {
      if (data.ok) {
        toast.success(i18n._(msg`backup.connectionOk`));
      } else {
        toast.error(data.error ?? i18n._(msg`backup.connectionFailed`));
      }
    },
    onError: () => toast.error(i18n._(msg`backup.connectionFailed`)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete<void>('/api/v1/user/preferences/backup-config/s3'),
    onSuccess: () => {
      toast.success(i18n._(msg`backup.configDeleted`));
      queryClient.invalidateQueries({ queryKey: ['backup-configs'] });
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
      form.reset({
        endpoint: '',
        bucket: '',
        access_key: '',
        secret_key: '',
        region: '',
        enabled: false,
      });
    },
    onError: () => toast.error(i18n._(msg`backup.deleteFailed`)),
  });

  return (
    <SettingsCard label={i18n._(msg`backup.s3Compatible`)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <form.Field name="endpoint">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="s3-endpoint">Endpoint</FieldLabel>
              <Input
                id="s3-endpoint"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="https://s3.amazonaws.com"
                className={INPUT_CLASS}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="bucket">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="s3-bucket">Bucket</FieldLabel>
              <Input
                id="s3-bucket"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="my-backup-bucket"
                className={INPUT_CLASS}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="access_key">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="s3-access-key">Access Key</FieldLabel>
              <Input
                id="s3-access-key"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="AKIAIOSFODNN7EXAMPLE"
                className={INPUT_CLASS}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="secret_key">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="s3-secret-key">Secret Key</FieldLabel>
              <PasswordInput
                id="s3-secret-key"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={existing ? '********' : 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'}
                className={INPUT_CLASS}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="region">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="s3-region">{i18n._(msg`backup.region`)}</FieldLabel>
              <Input
                id="s3-region"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="us-east-1"
                className={INPUT_CLASS}
              />
              <FieldDescription>{i18n._(msg`backup.regionOptional`)}</FieldDescription>
            </Field>
          )}
        </form.Field>

        <form.Field name="enabled">
          {(field) => (
            <div className="flex items-center justify-between">
              <Label className="text-sm text-mm-text-secondary">
                {i18n._(msg`backup.enabled`)}
              </Label>
              <Switch
                checked={field.state.value}
                onCheckedChange={(checked) => field.handleChange(checked)}
              />
            </div>
          )}
        </form.Field>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending ? <Spinner className="mr-1.5" /> : null}
            {i18n._(msg`backup.testConnection`)}
          </Button>

          {existing && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              size="sm"
            >
              {i18n._(msg`backup.delete`)}
            </Button>
          )}

          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={saveMutation.isPending || isSubmitting}>
                {saveMutation.isPending || isSubmitting
                  ? i18n._(msg`settings.saving`)
                  : i18n._(msg`settings.save`)}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </SettingsCard>
  );
}

// ─── Sync Controls Card ─────────────────────────────────────────────────────

function SyncControlsCard() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ['sync-status'],
    queryFn: () => api.get<SyncStatusEntry[]>('/api/v1/user/preferences/sync/status'),
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post<SyncResultEntry[]>('/api/v1/user/preferences/sync'),
    onSuccess: (results) => {
      const errors = results.filter((r) => r.status === 'error');
      if (errors.length === 0) {
        toast.success(i18n._(msg`backup.syncSuccess`));
      } else {
        for (const err of errors) {
          toast.error(`${err.type}: ${err.message ?? 'unknown error'}`);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['backup-configs'] });
    },
    onError: () => toast.error(i18n._(msg`backup.syncFailed`)),
  });

  const hasEnabledTarget = status?.some((s) => s.enabled) ?? false;

  const formatDate = (iso: string | null) => {
    if (!iso) return i18n._(msg`backup.neverSynced`);
    return new Date(iso).toLocaleString();
  };

  return (
    <SettingsCard label={i18n._(msg`backup.syncControls`)}>
      <div className="space-y-4">
        {status && status.length > 0 ? (
          <div className="space-y-2">
            {status.map((entry) => (
              <div
                key={entry.type}
                className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full',
                      entry.enabled ? 'bg-emerald-500' : 'bg-white/20'
                    )}
                  />
                  <span className="text-sm text-white/70 uppercase tracking-wide">
                    {entry.type}
                  </span>
                </div>
                <span className="text-xs text-white/40">{formatDate(entry.last_sync_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/30">{i18n._(msg`backup.noTargets`)}</p>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="accent"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || !hasEnabledTarget}
          >
            {syncMutation.isPending ? <Spinner className="mr-1.5" /> : null}
            {syncMutation.isPending ? i18n._(msg`backup.syncing`) : i18n._(msg`backup.syncNow`)}
          </Button>
        </div>
      </div>
    </SettingsCard>
  );
}

// ─── Backup Panel ───────────────────────────────────────────────────────────

export function BackupPanel() {
  const { i18n } = useLingui();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">{i18n._(msg`backup.title`)}</h2>
        <p className="mt-1 text-sm text-white/40">{i18n._(msg`backup.description`)}</p>
      </div>

      <JsonExportImportCard />
      <SyncControlsCard />
      <WebDAVConfigCard />
      <S3ConfigCard />
    </div>
  );
}
