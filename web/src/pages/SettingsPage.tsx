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
      toast.success('已儲存');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error('儲存失敗'),
  });

  return (
    <Section title="DandanPlay 設定" delay={0}>
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
        {saveMutation.isPending ? '儲存中…' : '儲存'}
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

      toast.success('已儲存');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error('儲存失敗'),
  });

  return (
    <Section title="播放器設定" delay={0.08}>
      {/* Danmaku enabled */}
      <div className="flex items-center justify-between">
        <Label className="text-sm text-mm-text-secondary">彈幕預設開啟</Label>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {/* Danmaku opacity */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm text-mm-text-secondary">彈幕透明度</Label>
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
        <Label className="text-sm text-mm-text-secondary">彈幕字體大小</Label>
        <SelectorGroup options={[...FONT_SIZE_OPTIONS]} value={fontSize} onChange={setFontSize} />
      </div>

      {/* Danmaku speed */}
      <div className="space-y-2">
        <Label className="text-sm text-mm-text-secondary">彈幕速度</Label>
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
        {saveMutation.isPending ? '儲存中…' : '儲存'}
      </Button>
    </Section>
  );
}

// ─── Appearance Section ──────────────────────────────────────────────────────
function AppearanceSection() {
  const [currentLang, setCurrentLang] = useState(
    () => localStorage.getItem('milmil-locale') ?? 'zh-Hant'
  );

  const handleLanguageChange = (code: string) => {
    setCurrentLang(code);
    localStorage.setItem('milmil-locale', code);
    loadAndActivate(code);
    toast.success('已儲存');
  };

  return (
    <Section title="外觀設定" delay={0.16}>
      <div className="space-y-2">
        <Label className="text-sm text-mm-text-secondary">語言選擇</Label>
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
      toast.success('已儲存');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error('儲存失敗'),
  });

  const connectMutation = useMutation({
    mutationFn: () => api.get<{ url: string }>(`/api/v1/integrations/${provider}/auth-url`),
    onSuccess: (data) => {
      window.open(data.url, '_blank');
    },
    onError: () => toast.error('取得授權連結失敗'),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete<void>(`/api/v1/integrations/${provider}`),
    onSuccess: () => {
      toast.success('已斷開連線');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error('斷開連線失敗'),
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      api.post<{ synced: number; errors: number; total: number }>(
        `/api/v1/integrations/${provider}/sync`
      ),
    onSuccess: (data) => {
      toast.success(`同步完成：${String(data.synced)} 筆成功，${String(data.errors)} 筆失敗`);
    },
    onError: () => toast.error('同步失敗'),
  });

  return (
    <Section title={`${label} 連動`} delay={delay}>
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
          {saveCredsMutation.isPending ? '儲存中…' : '儲存'}
        </Button>

        {isConfigured && !isConnected && (
          <Button
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
            variant="outline"
            className="font-bold border-[oklch(30%_0.01_280)] text-white hover:bg-[oklch(20%_0.01_280)]"
          >
            {connectMutation.isPending ? '連線中…' : '連線帳號'}
          </Button>
        )}

        {isConnected && (
          <>
            <span className="text-xs font-bold text-green-400">Connected</span>
            <Button
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              variant="outline"
              className="font-bold border-[oklch(30%_0.01_280)] text-red-400 hover:bg-[oklch(20%_0.01_280)]"
            >
              {disconnectMutation.isPending ? '斷開中…' : '斷開連線'}
            </Button>
            <Button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              variant="outline"
              className="font-bold border-[oklch(30%_0.01_280)] text-white hover:bg-[oklch(20%_0.01_280)]"
            >
              {syncMutation.isPending ? '同步中…' : '同步進度'}
            </Button>
          </>
        )}
      </div>
    </Section>
  );
}

// ─── Settings Page ───────────────────────────────────────────────────────────
export function SettingsPage() {
  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Header */}
        <div className="px-8 pt-12 pb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-mm-accent">milmil</p>
          <h1 className="text-3xl font-bold text-white mt-1 tracking-tight">Settings</h1>
        </div>

        {/* Sections */}
        <div className="px-8 pb-16 max-w-2xl">
          <DandanPlaySection />
          <IntegrationSection provider="bangumi" label="Bangumi" delay={0.04} />
          <IntegrationSection provider="anilist" label="AniList" delay={0.08} />
          <PlayerSection />
          <AppearanceSection />
        </div>
      </div>
    </PageTransition>
  );
}
