import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { ConnectionBadge } from '@/components/settings/ConnectionBadge';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Skeleton } from '@/components/Skeleton';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { useWSEvent } from '@/hooks/use-websocket';
import { api } from '@/lib/api-client';
import { syncApi, syncKeys, type SyncProvider, type SyncProviderStatus } from '@/lib/api/sync';

const INPUT_CLASS = 'bg-transparent border-white/[0.08] focus:border-mm-accent text-white';

// ─── DandanPlay Card ────────────────────────────────────────────────────────

function DandanPlayCard() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, any>>('/api/v1/settings'),
  });

  const form = useForm({
    defaultValues: { appId: '', appSecret: '' },
    onSubmit: async ({ value }) => {
      await saveMutation.mutateAsync({
        app_id: value.appId,
        app_secret: value.appSecret,
      });
    },
  });

  useEffect(() => {
    if (settings?.dandanplay) {
      form.reset({
        appId: settings.dandanplay.app_id ?? '',
        appSecret: settings.dandanplay.app_secret ?? '',
      });
    }
  }, [settings?.dandanplay]);

  const saveMutation = useMutation({
    mutationFn: (data: { app_id: string; app_secret: string }) =>
      api.put('/api/v1/settings/dandanplay', data),
    onSuccess: () => {
      toast.success(i18n._(msg`settings.saved`));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error(i18n._(msg`settings.saveFailed`)),
  });

  return (
    <SettingsCard label="DandanPlay">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <form.Field name="appId">
          {(field) => (
            <Field data-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor={field.name}>App ID</FieldLabel>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Your DandanPlay App ID"
                className={INPUT_CLASS}
              />
              <FieldError>
                {field.state.meta.isTouched && field.state.meta.errors[0]
                  ? String(field.state.meta.errors[0])
                  : null}
              </FieldError>
            </Field>
          )}
        </form.Field>

        <form.Field name="appSecret">
          {(field) => (
            <Field data-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor={field.name}>App Secret</FieldLabel>
              <PasswordInput
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Your DandanPlay App Secret"
                className={INPUT_CLASS}
              />
              <FieldError>
                {field.state.meta.isTouched && field.state.meta.errors[0]
                  ? String(field.state.meta.errors[0])
                  : null}
              </FieldError>
            </Field>
          )}
        </form.Field>

        <div className="flex justify-end">
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button
                type="submit"
                disabled={saveMutation.isPending || isSubmitting}
              >
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

// ─── OAuth Provider Card (reusable for Bangumi & AniList) ───────────────────

function formatLastSync(value: string, locale: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return d.toISOString();
  }
}

function SyncStatusBlock({ status }: { status: SyncProviderStatus }) {
  const { i18n } = useLingui();
  const lastSync = formatLastSync(status.last_sync, i18n.locale);

  return (
    <div className="mb-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/40">
          {i18n._(msg`settings.integration.lastSync`)}
        </span>
        <span className="text-white/70 tabular-nums">{lastSync}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/40">
          {i18n._(msg`settings.integration.pending`)}
        </span>
        <span className="text-white/70 tabular-nums">{status.pending}</span>
      </div>
      {status.last_errors.length > 0 && (
        <details className="group text-xs">
          <summary className="cursor-pointer text-white/60 hover:text-white/80 select-none">
            {i18n._(msg`settings.integration.recentErrors`)}
            <span className="ml-1 text-white/40">({status.last_errors.length})</span>
          </summary>
          <ul className="mt-2 space-y-1.5">
            {status.last_errors.slice(0, 5).map((err, idx) => (
              <li
                key={`${err.anime_id}-${err.at}-${idx}`}
                className="rounded border border-white/[0.06] bg-black/20 px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-white/50 truncate">
                    {err.anime_id}
                  </span>
                  <span className="text-[10px] text-white/30 shrink-0">
                    {formatLastSync(err.at, i18n.locale)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-white/60 break-words">{err.error}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SyncStatusSkeleton() {
  return (
    <div className="mb-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
      <Skeleton className="h-4" style={{ width: '60%' }} />
      <Skeleton className="h-4" style={{ width: '40%' }} />
    </div>
  );
}

function OAuthProviderCard({
  provider,
  label,
}: {
  provider: SyncProvider;
  label: string;
}) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, any>>('/api/v1/settings'),
  });

  const oauthKey = `${provider}_oauth`;
  const tokenKey = `${provider}_token`;
  const isConfigured = !!settings?.[oauthKey]?.client_id;
  const isConnected = !!settings?.[tokenKey]?.access_token;

  const { data: syncStatusList, isLoading: syncStatusLoading } = useQuery({
    queryKey: syncKeys.status(),
    queryFn: syncApi.status,
    refetchInterval: 15000,
    enabled: isConnected,
  });
  const providerStatus = syncStatusList?.find((s) => s.provider === provider);

  // React to backend ws event when a provider push fails and re-auth is required.
  // Invalidates sync status immediately instead of waiting for the 15s poll.
  useWSEvent((event) => {
    if (event.type !== 'sync:needs_reauth') return;
    const eventProvider =
      (event.data?.provider as string | undefined) ?? '';
    if (eventProvider !== provider) return;
    toast.error(
      `${label}: ${i18n._(msg`settings.integration.needsReauth`)}`,
    );
    queryClient.invalidateQueries({ queryKey: syncKeys.status() });
    queryClient.invalidateQueries({ queryKey: ['settings'] });
  });

  const form = useForm({
    defaultValues: { clientId: '', clientSecret: '' },
    onSubmit: async ({ value }) => {
      await saveCredsMutation.mutateAsync({
        client_id: value.clientId,
        client_secret: value.clientSecret,
      });
    },
  });

  useEffect(() => {
    if (settings?.[oauthKey]) {
      form.reset({
        clientId: settings[oauthKey].client_id ?? '',
        clientSecret: settings[oauthKey].client_secret ?? '',
      });
    }
  }, [settings, oauthKey]);

  const saveCredsMutation = useMutation({
    mutationFn: (data: { client_id: string; client_secret: string }) =>
      api.put(`/api/v1/settings/${oauthKey}`, data),
    onSuccess: () => {
      toast.success(i18n._(msg`settings.saved`));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error(i18n._(msg`settings.saveFailed`)),
  });

  const connectMutation = useMutation({
    mutationFn: () => api.get<{ url: string }>(`/api/v1/integrations/${provider}/auth-url`),
    onSuccess: (data) => {
      window.open(data.url, '_blank');
    },
    onError: () => toast.error(i18n._(msg`settings.integration.authUrlFailed`)),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete<void>(`/api/v1/integrations/${provider}`),
    onSuccess: () => {
      toast.success(i18n._(msg`settings.integration.disconnected`));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: syncKeys.status() });
    },
    onError: () => toast.error(i18n._(msg`settings.integration.disconnectFailed`)),
  });

  const syncMutation = useMutation({
    mutationFn: () => syncApi.flush(provider),
    onSuccess: (data) => {
      toast.success(
        `${i18n._(msg`settings.integration.syncComplete`)}: ${String(data.enqueued)}`,
      );
      queryClient.invalidateQueries({ queryKey: syncKeys.status() });
    },
    onError: () => toast.error(i18n._(msg`settings.integration.syncFailed`)),
  });

  return (
    <SettingsCard label={label}>
      <div className="mb-4">
        <ConnectionBadge
          connected={isConnected}
          connectedText={i18n._(msg`settings.integration.connected`)}
          disconnectedText={i18n._(msg`settings.integration.notConnected`)}
        />
      </div>

      {isConnected && (
        syncStatusLoading && !providerStatus ? (
          <SyncStatusSkeleton />
        ) : providerStatus ? (
          <SyncStatusBlock status={providerStatus} />
        ) : null
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <form.Field name="clientId">
          {(field) => (
            <Field data-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor={`${provider}-${field.name}`}>Client ID</FieldLabel>
              <Input
                id={`${provider}-${field.name}`}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={`Your ${label} Client ID`}
                className={INPUT_CLASS}
              />
              <FieldError>
                {field.state.meta.isTouched && field.state.meta.errors[0]
                  ? String(field.state.meta.errors[0])
                  : null}
              </FieldError>
            </Field>
          )}
        </form.Field>

        <form.Field name="clientSecret">
          {(field) => (
            <Field data-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor={`${provider}-${field.name}`}>Client Secret</FieldLabel>
              <PasswordInput
                id={`${provider}-${field.name}`}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={`Your ${label} Client Secret`}
                className={INPUT_CLASS}
              />
              <FieldError>
                {field.state.meta.isTouched && field.state.meta.errors[0]
                  ? String(field.state.meta.errors[0])
                  : null}
              </FieldError>
            </Field>
          )}
        </form.Field>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button
                type="submit"
                disabled={saveCredsMutation.isPending || isSubmitting}
              >
                {saveCredsMutation.isPending || isSubmitting
                  ? i18n._(msg`settings.saving`)
                  : i18n._(msg`settings.save`)}
              </Button>
            )}
          </form.Subscribe>

          {isConfigured && !isConnected && (
            <Button
              type="button"
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
              variant="outline"
            >
              {connectMutation.isPending
                ? i18n._(msg`settings.integration.connecting`)
                : i18n._(msg`settings.integration.connect`)}
            </Button>
          )}

          {isConnected && (
            <>
              <Button
                type="button"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                variant="destructive"
              >
                {disconnectMutation.isPending
                  ? i18n._(msg`settings.integration.disconnecting`)
                  : i18n._(msg`settings.integration.disconnect`)}
              </Button>
              <Button
                type="button"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                variant="outline"
              >
                {syncMutation.isPending
                  ? i18n._(msg`settings.integration.syncing`)
                  : i18n._(msg`settings.integration.sync`)}
              </Button>
            </>
          )}
        </div>
      </form>
    </SettingsCard>
  );
}

// ─── Integrations Panel ─────────────────────────────────────────────────────

export function IntegrationsPanel() {
  const { i18n } = useLingui();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">
          {i18n._(msg`settings.nav.integrations`)}
        </h2>
        <p className="mt-1 text-sm text-white/40">
          {i18n._(msg`settings.integrations.description`)}
        </p>
      </div>

      <div className="space-y-4">
        <DandanPlayCard />
      </div>

      <div className="space-y-4">
        <OAuthProviderCard provider="bangumi" label="Bangumi" />
      </div>

      <div className="space-y-4">
        <OAuthProviderCard provider="anilist" label="AniList" />
      </div>
    </div>
  );
}
