import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/Skeleton';
import { ConnectionBadge } from '@/components/settings/ConnectionBadge';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { useWSEvent } from '@/hooks/use-websocket';
import { type SyncProvider, type SyncProviderStatus, syncApi, syncKeys } from '@/lib/api/sync';
import { type DeviceCodeResponse, traktApi } from '@/lib/api/trakt';
import { api } from '@/lib/api-client';

const INPUT_CLASS = 'bg-transparent border-ink/[0.08] focus:border-mm-accent text-ink';

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
  }, [settings?.dandanplay, form.reset]);

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
              <FieldLabel htmlFor={field.name}>{i18n._(msg`App ID`)}</FieldLabel>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={i18n._(msg`Your DandanPlay App ID`)}
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
              <FieldLabel htmlFor={field.name}>{i18n._(msg`App Secret`)}</FieldLabel>
              <PasswordInput
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={i18n._(msg`Your DandanPlay App Secret`)}
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

// ─── TMDB Card ───────────────────────────────────────────────────────────────

function readTMDBAPIKey(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'api_key' in value) {
    const k = (value as { api_key?: unknown }).api_key;
    return typeof k === 'string' ? k : '';
  }
  return '';
}

function readTMDBAccessToken(value: unknown): string {
  if (!value || typeof value === 'string') return '';
  if (typeof value === 'object' && 'access_token' in value) {
    const t = (value as { access_token?: unknown }).access_token;
    return typeof t === 'string' ? t : '';
  }
  return '';
}

function TMDBCard() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, any>>('/api/v1/settings'),
  });

  const form = useForm({
    defaultValues: { apiKey: '', accessToken: '' },
    onSubmit: async ({ value }) => {
      await saveMutation.mutateAsync({
        api_key: value.apiKey.trim(),
        access_token: value.accessToken.trim(),
      });
    },
  });

  const tmdbSection = settings?.tmdb_api_key;
  useEffect(() => {
    if (tmdbSection !== undefined) {
      form.reset({
        apiKey: readTMDBAPIKey(tmdbSection),
        accessToken: readTMDBAccessToken(tmdbSection),
      });
    }
  }, [tmdbSection, form.reset]);

  const saveMutation = useMutation({
    mutationFn: (data: { api_key: string; access_token: string }) =>
      api.put('/api/v1/settings/tmdb_api_key', data),
    onSuccess: () => {
      toast.success(i18n._(msg`settings.saved`));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error(i18n._(msg`settings.saveFailed`)),
  });

  const testMutation = useMutation({
    mutationFn: (data: { api_key: string; access_token: string }) =>
      api.post<{ ok: boolean; error?: string }>('/api/v1/integrations/tmdb/test', data),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(i18n._(msg`TMDB connection successful`));
      } else {
        toast.error(res.error || i18n._(msg`TMDB connection failed`));
      }
    },
    onError: () => toast.error(i18n._(msg`TMDB connection failed`)),
  });

  return (
    <SettingsCard label="TMDB">
      <div className="mb-4">
        <form.Subscribe
          selector={(s) =>
            s.values.apiKey.trim().length > 0 || s.values.accessToken.trim().length > 0
          }
        >
          {(connected) => (
            <ConnectionBadge
              connected={connected}
              connectedText={i18n._(msg`Configured`)}
              disconnectedText={i18n._(msg`Not configured`)}
            />
          )}
        </form.Subscribe>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <form.Field name="apiKey">
          {(field) => (
            <Field data-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor={field.name}>{i18n._(msg`API Key`)}</FieldLabel>
              <PasswordInput
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={i18n._(msg`TMDB v3 API key`)}
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

        <form.Field name="accessToken">
          {(field) => (
            <Field data-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor={field.name}>{i18n._(msg`API Read Access Token`)}</FieldLabel>
              <PasswordInput
                multiline
                rows={3}
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={i18n._(msg`TMDB API Read Access Token`)}
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

        <p className="text-xs leading-relaxed text-ink/45">
          {i18n._(
            msg`Used for TMDB fallback matching and localized episode metadata based on your UI language. Read Access Token is preferred; v3 API key is still supported. Leave both blank to disable TMDB.`
          )}
        </p>

        <div className="flex justify-end gap-2">
          <form.Subscribe
            selector={(s) => ({
              apiKey: s.values.apiKey.trim(),
              accessToken: s.values.accessToken.trim(),
            })}
          >
            {({ apiKey, accessToken }) => {
              const hasCreds = apiKey.length > 0 || accessToken.length > 0;
              return (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!hasCreds || testMutation.isPending}
                  onClick={() =>
                    testMutation.mutate({ api_key: apiKey, access_token: accessToken })
                  }
                >
                  {testMutation.isPending ? i18n._(msg`Testing…`) : i18n._(msg`Test connection`)}
                </Button>
              );
            }}
          </form.Subscribe>
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
    <div className="mb-4 rounded-lg border border-ink/[0.06] bg-ink/[0.02] p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink/40">{i18n._(msg`settings.integration.lastSync`)}</span>
        <span className="text-ink/70 tabular-nums">{lastSync}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink/40">{i18n._(msg`settings.integration.pending`)}</span>
        <span className="text-ink/70 tabular-nums">{status.pending}</span>
      </div>
      {status.last_errors.length > 0 && (
        <details className="group text-xs">
          <summary className="cursor-pointer text-ink/60 hover:text-ink/80 select-none">
            {i18n._(msg`settings.integration.recentErrors`)}
            <span className="ml-1 text-ink/40">({status.last_errors.length})</span>
          </summary>
          <ul className="mt-2 space-y-1.5">
            {status.last_errors.slice(0, 5).map((err) => (
              <li
                key={`${err.anime_id}-${err.at}-${err.error}`}
                className="rounded border border-ink/[0.06] bg-black/20 px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-ink/50 truncate">{err.anime_id}</span>
                  <span className="text-[10px] text-ink/30 shrink-0">
                    {formatLastSync(err.at, i18n.locale)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-ink/60 break-words">{err.error}</p>
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
    <div className="mb-4 rounded-lg border border-ink/[0.06] bg-ink/[0.02] p-3 space-y-2">
      <Skeleton className="h-4" style={{ width: '60%' }} />
      <Skeleton className="h-4" style={{ width: '40%' }} />
    </div>
  );
}

// ─── Pull Controls (Pull now + auto-pull toggle) ────────────────────────────

function PullControls({ provider }: { provider: SyncProvider }) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  // Default-assume auto-pull is enabled; the status endpoint does not currently
  // expose `pull_enabled`, but the toggle still writes idempotently to
  // sync_provider_state.
  const [pullEnabled, setPullEnabled] = useState(true);

  const pullMut = useMutation({
    mutationFn: () => syncApi.pullNow(provider),
    onSuccess: (res) => {
      toast.success(`${i18n._(msg`settings.integration.pulled`)}: ${String(res.updated_local)}`);
      queryClient.invalidateQueries({ queryKey: syncKeys.status() });
    },
    onError: () => toast.error(i18n._(msg`settings.integration.pullFailed`)),
  });

  const setEnabledMut = useMutation({
    mutationFn: (enabled: boolean) => syncApi.setPullEnabled(provider, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: syncKeys.status() });
    },
    onError: () => toast.error(i18n._(msg`settings.integration.pullToggleFailed`)),
  });

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink/[0.06] bg-ink/[0.02] p-3">
      <label className="flex items-center gap-2 text-xs text-ink/70">
        <input
          type="checkbox"
          checked={pullEnabled}
          onChange={(e) => {
            const next = e.target.checked;
            setPullEnabled(next);
            setEnabledMut.mutate(next);
          }}
          className="h-4 w-4 rounded border-ink/20 bg-transparent"
        />
        {i18n._(msg`settings.integration.autoPull`)}
      </label>
      <Button
        type="button"
        variant="outline"
        onClick={() => pullMut.mutate()}
        disabled={pullMut.isPending}
      >
        {pullMut.isPending
          ? i18n._(msg`settings.integration.pulling`)
          : i18n._(msg`settings.integration.pullNow`)}
      </Button>
    </div>
  );
}

// ─── Trakt Card (device-code OAuth) ─────────────────────────────────────────

function TraktCard() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: syncStatusList, isLoading: syncStatusLoading } = useQuery({
    queryKey: syncKeys.status(),
    queryFn: syncApi.status,
    refetchInterval: 15000,
  });
  const providerStatus = syncStatusList?.find((s) => s.provider === 'trakt');
  const isConnected = !!providerStatus?.connected;

  useWSEvent((event) => {
    if (event.type !== 'sync:needs_reauth') return;
    const eventProvider = (event.data?.provider as string | undefined) ?? '';
    if (eventProvider !== 'trakt') return;
    toast.error(`Trakt: ${i18n._(msg`settings.integration.needsReauth`)}`);
    queryClient.invalidateQueries({ queryKey: syncKeys.status() });
  });

  const startMut = useMutation({
    mutationFn: () => traktApi.requestDeviceCode(),
    onSuccess: (dc) => {
      setDeviceCode(dc);
      setPollError(null);
    },
    onError: () => toast.error(i18n._(msg`settings.integration.authUrlFailed`)),
  });

  const disconnectMut = useMutation({
    mutationFn: () => traktApi.disconnect(),
    onSuccess: () => {
      toast.success(i18n._(msg`settings.integration.disconnected`));
      queryClient.invalidateQueries({ queryKey: syncKeys.status() });
    },
    onError: () => toast.error(i18n._(msg`settings.integration.disconnectFailed`)),
  });

  const syncMut = useMutation({
    mutationFn: () => syncApi.flush('trakt'),
    onSuccess: (data) => {
      toast.success(`${i18n._(msg`settings.integration.syncComplete`)}: ${String(data.enqueued)}`);
      queryClient.invalidateQueries({ queryKey: syncKeys.status() });
    },
    onError: () => toast.error(i18n._(msg`settings.integration.syncFailed`)),
  });

  useEffect(() => {
    if (!deviceCode) return;
    const intervalMs = (deviceCode.poll_interval || 5) * 1000;
    const tick = async () => {
      try {
        const res = await traktApi.pollDeviceCode();
        if (res.status === 'approved') {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          setDeviceCode(null);
          setPollError(null);
          toast.success(i18n._(msg`settings.integration.connected`));
          queryClient.invalidateQueries({ queryKey: syncKeys.status() });
        } else if (res.status === 'expired' || res.status === 'denied') {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          setDeviceCode(null);
          setPollError(res.status);
        }
      } catch (e: unknown) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        setDeviceCode(null);
        setPollError(e instanceof Error ? e.message : String(e));
      }
    };
    timerRef.current = setInterval(tick, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [deviceCode, queryClient, i18n]);

  return (
    <SettingsCard label="Trakt">
      <div className="mb-4">
        <ConnectionBadge
          connected={isConnected}
          connectedText={i18n._(msg`settings.integration.connected`)}
          disconnectedText={i18n._(msg`settings.integration.notConnected`)}
        />
      </div>

      {isConnected &&
        (syncStatusLoading && !providerStatus ? (
          <SyncStatusSkeleton />
        ) : providerStatus ? (
          <>
            <SyncStatusBlock status={providerStatus} />
            <PullControls provider="trakt" />
          </>
        ) : null)}

      {deviceCode ? (
        <div className="rounded-lg border border-ink/[0.08] bg-black/30 p-4">
          <p className="text-sm text-ink/80">
            {i18n._(msg`settings.integration.trakt.openAndEnter`)}{' '}
            <a
              href={deviceCode.verification_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-ink"
            >
              {deviceCode.verification_url}
            </a>
          </p>
          <div className="mt-3 font-mono text-3xl tracking-widest text-ink select-all">
            {deviceCode.user_code}
          </div>
          <p className="mt-2 text-xs text-ink/50">
            {i18n._(msg`settings.integration.trakt.waitingExpires`)}{' '}
            {Math.max(1, Math.floor(deviceCode.expires_in / 60))}m
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {pollError && <span className="text-xs text-red-400 mr-auto">{pollError}</span>}
          {!isConnected ? (
            <Button
              type="button"
              onClick={() => startMut.mutate()}
              disabled={startMut.isPending}
              variant="outline"
            >
              {startMut.isPending
                ? i18n._(msg`settings.integration.connecting`)
                : i18n._(msg`settings.integration.connect`)}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                onClick={() => disconnectMut.mutate()}
                disabled={disconnectMut.isPending}
                variant="destructive"
              >
                {disconnectMut.isPending
                  ? i18n._(msg`settings.integration.disconnecting`)
                  : i18n._(msg`settings.integration.disconnect`)}
              </Button>
              <Button
                type="button"
                onClick={() => syncMut.mutate()}
                disabled={syncMut.isPending}
                variant="outline"
              >
                {syncMut.isPending
                  ? i18n._(msg`settings.integration.syncing`)
                  : i18n._(msg`settings.integration.sync`)}
              </Button>
            </>
          )}
        </div>
      )}
    </SettingsCard>
  );
}

function OAuthProviderCard({ provider, label }: { provider: SyncProvider; label: string }) {
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
    const eventProvider = (event.data?.provider as string | undefined) ?? '';
    if (eventProvider !== provider) return;
    toast.error(`${label}: ${i18n._(msg`settings.integration.needsReauth`)}`);
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
  }, [settings, oauthKey, form.reset]);

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
      toast.success(`${i18n._(msg`settings.integration.syncComplete`)}: ${String(data.enqueued)}`);
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

      {isConnected &&
        (syncStatusLoading && !providerStatus ? (
          <SyncStatusSkeleton />
        ) : providerStatus ? (
          <>
            <SyncStatusBlock status={providerStatus} />
            <PullControls provider={provider} />
          </>
        ) : null)}

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
              <FieldLabel htmlFor={`${provider}-${field.name}`}>
                {i18n._(msg`Client ID`)}
              </FieldLabel>
              <Input
                id={`${provider}-${field.name}`}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={i18n._(msg`Your ${label} Client ID`)}
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
              <FieldLabel htmlFor={`${provider}-${field.name}`}>
                {i18n._(msg`Client Secret`)}
              </FieldLabel>
              <PasswordInput
                id={`${provider}-${field.name}`}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={i18n._(msg`Your ${label} Client Secret`)}
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
              <Button type="submit" disabled={saveCredsMutation.isPending || isSubmitting}>
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
  const queryClient = useQueryClient();

  // Broadcast when a scheduled or manual pull completes on the backend.
  // Only surface a toast when something actually changed to avoid noise from
  // the 30-minute scheduler.
  useWSEvent((event) => {
    if (event.type !== 'sync:pulled') return;
    const provider = (event.data?.provider as string | undefined) ?? '';
    const updatedCount = Number(event.data?.updated_count ?? 0);
    if (updatedCount > 0) {
      toast.info(`${provider}: ${updatedCount} ${i18n._(msg`settings.integration.updatesPulled`)}`);
    }
    queryClient.invalidateQueries({ queryKey: syncKeys.status() });
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">{i18n._(msg`settings.nav.integrations`)}</h2>
        <p className="mt-1 text-sm text-ink/40">{i18n._(msg`settings.integrations.description`)}</p>
      </div>

      <div className="space-y-4">
        <DandanPlayCard />
      </div>

      <div className="space-y-4">
        <TMDBCard />
      </div>

      <div className="space-y-4">
        <OAuthProviderCard provider="bangumi" label="Bangumi" />
      </div>

      <div className="space-y-4">
        <OAuthProviderCard provider="anilist" label="AniList" />
      </div>

      <div className="space-y-4">
        <TraktCard />
      </div>
    </div>
  );
}
