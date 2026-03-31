import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { ConnectionBadge } from '@/components/settings/ConnectionBadge';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { api } from '@/lib/api-client';

const INPUT_CLASS = 'bg-transparent border-white/[0.08] focus:border-mm-accent text-white';
const ACCENT_BTN_CLASS = 'font-bold text-black bg-mm-accent';
const OUTLINE_BTN_CLASS = 'font-bold border-white/[0.1] text-white hover:bg-white/[0.05]';

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

        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              disabled={saveMutation.isPending || isSubmitting}
              className={ACCENT_BTN_CLASS}
            >
              {saveMutation.isPending || isSubmitting
                ? i18n._(msg`settings.saving`)
                : i18n._(msg`settings.save`)}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </SettingsCard>
  );
}

// ─── OAuth Provider Card (reusable for Bangumi & AniList) ───────────────────

function OAuthProviderCard({
  provider,
  label,
}: {
  provider: 'bangumi' | 'anilist';
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
    },
    onError: () => toast.error(i18n._(msg`settings.integration.disconnectFailed`)),
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      api.post<{ synced: number; errors: number; total: number }>(
        `/api/v1/integrations/${provider}/sync`,
      ),
    onSuccess: (data) => {
      toast.success(
        `${i18n._(msg`settings.integration.syncComplete`)}: ${String(data.synced)} / ${String(data.errors)} ${i18n._(msg`settings.integration.syncErrors`)}`,
      );
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

        <div className="flex items-center gap-3 flex-wrap">
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button
                type="submit"
                disabled={saveCredsMutation.isPending || isSubmitting}
                className={ACCENT_BTN_CLASS}
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
              className={OUTLINE_BTN_CLASS}
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
                variant="outline"
                className="font-bold border-white/[0.1] text-red-400 hover:bg-white/[0.05]"
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
                className={OUTLINE_BTN_CLASS}
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
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-[18px] font-bold text-white">
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
