import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageTransition } from '../components/PageTransition';
import { Button } from '../components/ui/button';
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

  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');

  useEffect(() => {
    if (settings?.dandanplay) {
      setAppId(settings.dandanplay.app_id ?? '');
      setAppSecret(settings.dandanplay.app_secret ?? '');
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
      <div className="space-y-1.5">
        <Label
          htmlFor="dandanplay-app-id"
          className="text-[10px] font-bold uppercase tracking-[0.2em] text-mm-text-secondary"
        >
          App ID
        </Label>
        <Input
          id="dandanplay-app-id"
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          placeholder="Your DandanPlay App ID"
          className="bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
        />
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor="dandanplay-app-secret"
          className="text-[10px] font-bold uppercase tracking-[0.2em] text-mm-text-secondary"
        >
          App Secret
        </Label>
        <Input
          id="dandanplay-app-secret"
          type="password"
          value={appSecret}
          onChange={(e) => setAppSecret(e.target.value)}
          placeholder="Your DandanPlay App Secret"
          className="bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
        />
      </div>
      <Button
        onClick={() =>
          saveMutation.mutate({
            section: 'dandanplay',
            data: { app_id: appId, app_secret: appSecret },
          })
        }
        disabled={saveMutation.isPending}
        className="font-bold text-black bg-mm-accent"
      >
        {saveMutation.isPending ? i18n._(msg`settings.saving`) : i18n._(msg`settings.save`)}
      </Button>
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

  const [enabled, setEnabled] = useState(danmakuEnabled);
  const [opacity, setOpacity] = useState(Math.round(danmakuOpacity * 100));
  const [fontSize, setFontSize] = useState(danmakuFontSize);
  const [speed, setSpeed] = useState(danmakuSpeed);

  useEffect(() => {
    setEnabled(danmakuEnabled);
    setOpacity(Math.round(danmakuOpacity * 100));
    setFontSize(danmakuFontSize);
    setSpeed(danmakuSpeed);
  }, [danmakuEnabled, danmakuOpacity, danmakuFontSize, danmakuSpeed]);

  const saveMutation = useMutation({
    mutationFn: ({ section, data }: { section: string; data: any }) =>
      api.put(`/api/v1/settings/${section}`, data),
    onSuccess: () => {
      // Update Zustand store
      const store = usePlayerStore.getState();
      if (enabled !== store.danmakuEnabled) store.toggleDanmaku();
      store.setDanmakuOpacity(opacity / 100);
      store.setDanmakuFontSize(fontSize);
      store.setDanmakuSpeed(speed);

      toast.success(i18n._(msg`settings.saved`));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error(i18n._(msg`settings.saveFailed`)),
  });

  return (
    <Section title={i18n._(msg`settings.player.title`)} delay={0.08}>
      {/* Danmaku enabled */}
      <div className="flex items-center justify-between">
        <Label className="text-sm text-mm-text-secondary">
          {i18n._(msg`settings.player.danmakuEnabled`)}
        </Label>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {/* Danmaku opacity */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm text-mm-text-secondary">
            {i18n._(msg`settings.player.danmakuOpacity`)}
          </Label>
          <span className="text-xs text-mm-text-tertiary tabular-nums">{opacity}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-mm-accent"
          style={{
            background: `linear-gradient(to right, var(--mm-accent) ${String(opacity)}%, oklch(18% 0.01 280) ${String(opacity)}%)`,
          }}
        />
      </div>

      {/* Danmaku font size */}
      <div className="space-y-2">
        <Label className="text-sm text-mm-text-secondary">
          {i18n._(msg`settings.player.danmakuFontSize`)}
        </Label>
        <SelectorGroup options={[...FONT_SIZE_OPTIONS]} value={fontSize} onChange={setFontSize} />
      </div>

      {/* Danmaku speed */}
      <div className="space-y-2">
        <Label className="text-sm text-mm-text-secondary">
          {i18n._(msg`settings.player.danmakuSpeed`)}
        </Label>
        <SelectorGroup options={[...SPEED_OPTIONS]} value={speed} onChange={setSpeed} />
      </div>

      <Button
        onClick={() =>
          saveMutation.mutate({
            section: 'player',
            data: {
              danmaku_enabled: enabled,
              danmaku_opacity: opacity / 100,
              danmaku_font_size: fontSize,
              danmaku_speed: speed,
            },
          })
        }
        disabled={saveMutation.isPending}
        className="font-bold text-black bg-mm-accent"
      >
        {saveMutation.isPending ? i18n._(msg`settings.saving`) : i18n._(msg`settings.save`)}
      </Button>
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

  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  useEffect(() => {
    if (settings?.[oauthKey]) {
      setClientId(settings[oauthKey].client_id ?? '');
      setClientSecret(settings[oauthKey].client_secret ?? '');
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
      {/* OAuth credentials */}
      <div className="space-y-1.5">
        <Label
          htmlFor={`${provider}-client-id`}
          className="text-[10px] font-bold uppercase tracking-[0.2em] text-mm-text-secondary"
        >
          Client ID
        </Label>
        <Input
          id={`${provider}-client-id`}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder={`Your ${label} Client ID`}
          className="bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
        />
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor={`${provider}-client-secret`}
          className="text-[10px] font-bold uppercase tracking-[0.2em] text-mm-text-secondary"
        >
          Client Secret
        </Label>
        <Input
          id={`${provider}-client-secret`}
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder={`Your ${label} Client Secret`}
          className="bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          onClick={() =>
            saveCredsMutation.mutate({ client_id: clientId, client_secret: clientSecret })
          }
          disabled={saveCredsMutation.isPending}
          className="font-bold text-black bg-mm-accent"
        >
          {saveCredsMutation.isPending ? i18n._(msg`settings.saving`) : i18n._(msg`settings.save`)}
        </Button>

        {isConfigured && !isConnected && (
          <Button
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
