import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageTransition } from '../components/PageTransition';
import { Button } from '../components/ui/button';
import { Field, FieldError, FieldLabel } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { availableLanguages, loadAndActivate } from '../i18n/config';
import { api } from '../lib/api-client';
import { cn } from '../lib/utils';
import { usePlayerStore } from '../store/player-store';

// ─── Section wrapper ─────────────────────────────────────────────────────────
function Section({
  title,
  children,
  delay = 0,
}: {
  title: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="border-b py-6 first:pt-0 last:border-b-0"
      style={{ borderColor: 'oklch(18% 0.01 280)' }}
    >
      <h2 className="text-[15px] font-bold text-white mb-5">{title}</h2>
      <div className="space-y-4">{children}</div>
    </motion.section>
  );
}

// ─── Selector button group ───────────────────────────────────────────────────
function SelectorGroup<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 py-1.5 text-xs font-semibold rounded transition-colors border',
            value === opt.value
              ? 'bg-mm-accent text-black border-mm-accent'
              : 'bg-transparent text-mm-text-secondary border-[oklch(22%_0.01_280)] hover:border-[oklch(30%_0.01_280)]'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── DandanPlay Section ──────────────────────────────────────────────────────
function DandanPlaySection() {
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
        section: 'dandanplay',
        data: { app_id: value.appId, app_secret: value.appSecret },
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
    mutationFn: ({ section, data }: { section: string; data: any }) =>
      api.put(`/api/v1/settings/${section}`, data),
    onSuccess: () => {
      toast.success(i18n._(msg`settings.saved`));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error(i18n._(msg`settings.saveFailed`)),
  });

  return (
    <Section title={i18n._(msg`settings.dandanplay.title`)} delay={0}>
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
                className="bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
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
              <Input
                id={field.name}
                type="password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Your DandanPlay App Secret"
                className="bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
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
              className="font-bold text-black bg-mm-accent"
            >
              {saveMutation.isPending || isSubmitting
                ? i18n._(msg`settings.saving`)
                : i18n._(msg`settings.save`)}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </Section>
  );
}

// ─── Speed mapping ───────────────────────────────────────────────────────────
const SPEED_OPTIONS = [
  { label: '慢', value: 96 },
  { label: '正常', value: 144 },
  { label: '快', value: 200 },
] as const;

const FONT_SIZE_OPTIONS = [
  { label: '16', value: 16 },
  { label: '20', value: 20 },
  { label: '24', value: 24 },
] as const;

// ─── Player Section ──────────────────────────────────────────────────────────
function PlayerSection() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const danmakuEnabled = usePlayerStore((s) => s.danmakuEnabled);
  const danmakuOpacity = usePlayerStore((s) => s.danmakuOpacity);
  const danmakuFontSize = usePlayerStore((s) => s.danmakuFontSize);
  const danmakuSpeed = usePlayerStore((s) => s.danmakuSpeed);

  const form = useForm({
    defaultValues: {
      enabled: danmakuEnabled,
      opacity: Math.round(danmakuOpacity * 100),
      fontSize: danmakuFontSize,
      speed: danmakuSpeed,
    },
    onSubmit: async ({ value }) => {
      await saveMutation.mutateAsync({
        section: 'player',
        data: {
          danmaku_enabled: value.enabled,
          danmaku_opacity: value.opacity / 100,
          danmaku_font_size: value.fontSize,
          danmaku_speed: value.speed,
        },
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
  }, [danmakuEnabled, danmakuOpacity, danmakuFontSize, danmakuSpeed]);

  const saveMutation = useMutation({
    mutationFn: ({ section, data }: { section: string; data: any }) =>
      api.put(`/api/v1/settings/${section}`, data),
    onSuccess: (_data, variables) => {
      // Update Zustand store
      const store = usePlayerStore.getState();
      const { danmaku_enabled, danmaku_opacity, danmaku_font_size, danmaku_speed } =
        variables.data;
      if (danmaku_enabled !== store.danmakuEnabled) store.toggleDanmaku();
      store.setDanmakuOpacity(danmaku_opacity);
      store.setDanmakuFontSize(danmaku_font_size);
      store.setDanmakuSpeed(danmaku_speed);

      toast.success(i18n._(msg`settings.saved`));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error(i18n._(msg`settings.saveFailed`)),
  });

  return (
    <Section title={i18n._(msg`settings.player.title`)} delay={0.08}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        {/* Danmaku enabled */}
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

        {/* Danmaku opacity */}
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

        {/* Danmaku font size */}
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

        {/* Danmaku speed */}
        <form.Field name="speed">
          {(field) => (
            <div className="space-y-2">
              <Label className="text-sm text-mm-text-secondary">
                {i18n._(msg`settings.player.danmakuSpeed`)}
              </Label>
              <SelectorGroup
                options={[...SPEED_OPTIONS]}
                value={field.state.value}
                onChange={(v) => field.handleChange(v)}
              />
            </div>
          )}
        </form.Field>

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
    </Section>
  );
}

// ─── Appearance Section ──────────────────────────────────────────────────────
function AppearanceSection() {
  const { i18n } = useLingui();
  const [currentLang, setCurrentLang] = useState(
    () => localStorage.getItem('milmil-locale') ?? 'zh-Hant'
  );

  const handleLanguageChange = (code: string) => {
    setCurrentLang(code);
    localStorage.setItem('milmil-locale', code);
    loadAndActivate(code);
    toast.success(i18n._(msg`settings.saved`));
  };

  return (
    <Section title={i18n._(msg`settings.appearance.title`)} delay={0.16}>
      <div className="space-y-2">
        <Label className="text-sm text-mm-text-secondary">
          {i18n._(msg`settings.appearance.language`)}
        </Label>
        <SelectorGroup
          options={availableLanguages.map((l) => ({ label: l.label, value: l.code }))}
          value={currentLang}
          onChange={handleLanguageChange}
        />
      </div>
    </Section>
  );
}

// ─── Integration Section (Bangumi / AniList) ───────────────────────────────
function IntegrationSection({
  provider,
  label,
  delay,
}: {
  provider: 'bangumi' | 'anilist';
  label: string;
  delay: number;
}) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, any>>('/api/v1/settings'),
  });

  const oauthKey = `${provider}_oauth`;
  const tokenKey = `${provider}_token`;
  const isConfigured = settings?.[oauthKey]?.client_id;
  const isConnected = settings?.[tokenKey]?.access_token;

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
        `/api/v1/integrations/${provider}/sync`
      ),
    onSuccess: (data) => {
      toast.success(
        `${i18n._(msg`settings.integration.syncComplete`)}: ${String(data.synced)} / ${String(data.errors)} ${i18n._(msg`settings.integration.syncErrors`)}`
      );
    },
    onError: () => toast.error(i18n._(msg`settings.integration.syncFailed`)),
  });

  return (
    <Section title={`${label} ${i18n._(msg`settings.integration.title`)}`} delay={delay}>
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
                className="bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
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
              <Input
                id={`${provider}-${field.name}`}
                type="password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={`Your ${label} Client Secret`}
                className="bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
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
                className="font-bold text-black bg-mm-accent"
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
              className="font-bold border-[oklch(30%_0.01_280)] text-white hover:bg-[oklch(20%_0.01_280)]"
            >
              {connectMutation.isPending
                ? i18n._(msg`settings.integration.connecting`)
                : i18n._(msg`settings.integration.connect`)}
            </Button>
          )}

          {isConnected && (
            <>
              <span className="text-xs font-bold text-green-400">
                {i18n._(msg`settings.integration.connected`)}
              </span>
              <Button
                type="button"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                variant="outline"
                className="font-bold border-[oklch(30%_0.01_280)] text-red-400 hover:bg-[oklch(20%_0.01_280)]"
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
                className="font-bold border-[oklch(30%_0.01_280)] text-white hover:bg-[oklch(20%_0.01_280)]"
              >
                {syncMutation.isPending
                  ? i18n._(msg`settings.integration.syncing`)
                  : i18n._(msg`settings.integration.sync`)}
              </Button>
            </>
          )}
        </div>
      </form>
    </Section>
  );
}

// ─── Collection Section ──────────────────────────────────────────────────────
function CollectionSection() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

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

  return (
    <Section title={i18n._(msg`settings.collection`)} delay={0.24}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-white/80">{i18n._(msg`settings.autoAddToCollection`)}</p>
          <p className="text-xs text-white/40 mt-0.5">
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
    </Section>
  );
}

// ─── Settings Page ───────────────────────────────────────────────────────────
export function SettingsPage() {
  const { i18n } = useLingui();
  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Header */}
        <div className="px-8 pt-12 pb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-mm-accent">milmil</p>
          <h1 className="text-3xl font-bold text-white mt-1 tracking-tight">
            {i18n._(msg`settings.pageTitle`)}
          </h1>
        </div>

        {/* Sections */}
        <div className="px-8 pb-16 max-w-2xl">
          <DandanPlaySection />
          <IntegrationSection provider="bangumi" label="Bangumi" delay={0.04} />
          <IntegrationSection provider="anilist" label="AniList" delay={0.08} />
          <PlayerSection />
          <AppearanceSection />
          <CollectionSection />
        </div>
      </div>
    </PageTransition>
  );
}
