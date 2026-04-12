import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Loading03Icon } from '@hugeicons/core-free-icons';

import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  type DiscordBotConfig,
  type NotificationSettings,
  type ProviderName,
  type ProviderStatus,
  type TelegramBotConfig,
  NOTIFICATION_EVENTS,
  PROVIDERS,
  notificationSettingsApi,
  notificationSettingsKeys,
} from '@/lib/api/notification-settings';

const INPUT_CLASS = 'bg-transparent border-white/[0.08] focus:border-mm-accent text-white';

const BOT_LANGUAGES = [
  { code: 'zh-HK', label: '粵語' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
];

const PROVIDER_META: Record<
  ProviderName,
  { label: string; color: string; colorClass: string }
> = {
  discord: { label: 'Discord', color: '#5865F2', colorClass: 'text-[#5865F2]' },
  telegram: { label: 'Telegram', color: '#26A5E4', colorClass: 'text-[#26A5E4]' },
  webhook: { label: 'Webhook', color: '', colorClass: 'text-white/50' },
};

const EVENT_LABEL_KEYS: Record<string, { label: ReturnType<typeof msg>; desc: ReturnType<typeof msg> }> = {
  'download.started': {
    label: msg`notifications.event.downloadStarted`,
    desc: msg`notifications.event.downloadStarted.desc`,
  },
  'download.completed': {
    label: msg`notifications.event.downloadCompleted`,
    desc: msg`notifications.event.downloadCompleted.desc`,
  },
  'download.failed': {
    label: msg`notifications.event.downloadFailed`,
    desc: msg`notifications.event.downloadFailed.desc`,
  },
  'library.scan_complete': {
    label: msg`notifications.event.libraryScanComplete`,
    desc: msg`notifications.event.libraryScanComplete.desc`,
  },
  'system.error': {
    label: msg`notifications.event.systemError`,
    desc: msg`notifications.event.systemError.desc`,
  },
  'auth.login': {
    label: msg`notifications.event.authLogin`,
    desc: msg`notifications.event.authLogin.desc`,
  },
  'anime.airing': {
    label: msg`notifications.event.animeAiring`,
    desc: msg`notifications.event.animeAiring.desc`,
  },
};

// ─── Default empty settings ─────────────────────────────────────────────────

function defaultSettings(): NotificationSettings {
  return {
    providers: {
      discord: { enabled: false, webhook_url: '' },
      telegram: { enabled: false, bot_token: '', chat_id: '' },
      webhook: { enabled: false, url: '', secret: '' },
    },
    events: {},
    bot: {
      telegram: { enabled: false, bot_token: '', webhook_url: '', allowed_chat_ids: [], report_interval: '', language: '', airing_reminder_minutes: 0 },
      discord: { enabled: false, bot_token: '', application_id: '', allowed_guild_ids: [] },
    },
  };
}

// ─── Status Badge ───────────────────────────────────────────────────────────

function ProviderStatusBadge({
  status,
}: {
  status: ProviderStatus | undefined;
}) {
  const { i18n } = useLingui();

  if (!status) return null;

  const config: Record<string, { dot: string; text: string; label: ReturnType<typeof msg> }> = {
    ok: { dot: 'bg-green-400', text: 'text-green-400', label: msg`notifications.providerStatus.ok` },
    error: { dot: 'bg-red-400', text: 'text-red-400', label: msg`notifications.providerStatus.error` },
    unconfigured: {
      dot: 'bg-white/15',
      text: 'text-white/40',
      label: msg`notifications.providerStatus.unconfigured`,
    },
  };

  const c = config[status.status] ?? config.unconfigured!;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
      <span className={cn('h-1.5 w-1.5 rounded-full', c!.dot)} />
      <span className={c!.text}>{i18n._(c!.label)}</span>
    </span>
  );
}

// ─── Test Button ────────────────────────────────────────────────────────────

function TestButton({ provider }: { provider: ProviderName }) {
  const { i18n } = useLingui();
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);

  const testMutation = useMutation({
    mutationFn: () => notificationSettingsApi.test(provider),
    onSuccess: (data) => {
      setResult(data);
      setTimeout(() => setResult(null), 5000);
    },
    onError: (err) => {
      setResult({ success: false, error: String(err) });
      setTimeout(() => setResult(null), 5000);
    },
  });

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={testMutation.isPending}
        onClick={() => {
          setResult(null);
          testMutation.mutate();
        }}
        className="text-[11px] text-white/30 hover:text-white/60 hover:bg-white/[0.06] px-2 py-1 rounded transition-colors disabled:opacity-40 cursor-pointer"
      >
        {testMutation.isPending ? (
          <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
        ) : (
          i18n._(msg`notifications.test`)
        )}
      </button>
      <AnimatePresence>
        {result && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className={cn('text-xs font-medium', result.success ? 'text-green-400' : 'text-red-400')}
          >
            {result.success
              ? i18n._(msg`notifications.testSuccess`)
              : `${i18n._(msg`notifications.testFailed`)}: ${result.error ?? ''}`}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function TestBotButton({ platform }: { platform: 'telegram' | 'discord' }) {
  const { i18n } = useLingui();
  const [result, setResult] = useState<{ success: boolean; error?: string; bot_username?: string } | null>(null);

  const testMutation = useMutation({
    mutationFn: () => notificationSettingsApi.testBot(platform),
    onSuccess: (data) => {
      setResult(data);
      if (data.success) setTimeout(() => setResult(null), 8000);
    },
    onError: (err) => {
      setResult({ success: false, error: String(err) });
      setTimeout(() => setResult(null), 5000);
    },
  });

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={testMutation.isPending}
        onClick={() => { setResult(null); testMutation.mutate(); }}
        className="text-[11px] text-white/30 hover:text-white/60 hover:bg-white/[0.06] px-2 py-1 rounded transition-colors disabled:opacity-40 cursor-pointer"
      >
        {testMutation.isPending ? (
          <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
        ) : (
          i18n._(msg`notifications.testBot`)
        )}
      </button>
      <AnimatePresence>
        {result && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className={cn('text-xs font-medium', result.success ? 'text-green-400' : 'text-red-400')}
          >
            {result.success
              ? `@${result.bot_username}`
              : `${i18n._(msg`notifications.testFailed`)}: ${result.error ?? ''}`}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Provider Cards ─────────────────────────────────────────────────────────

function DiscordCard({
  config,
  onChange,
  status,
  botConfig,
  onBotChange,
}: {
  config: NotificationSettings['providers']['discord'];
  onChange: (c: NotificationSettings['providers']['discord']) => void;
  status: ProviderStatus | undefined;
  botConfig: DiscordBotConfig;
  onBotChange: (updates: Partial<DiscordBotConfig>) => void;
}) {
  const { i18n } = useLingui();

  const [guildIdsRaw, setGuildIdsRaw] = useState(
    (botConfig.allowed_guild_ids ?? []).join(', '),
  );
  useEffect(() => {
    setGuildIdsRaw((botConfig.allowed_guild_ids ?? []).join(', '));
  }, [botConfig.allowed_guild_ids]);

  const handleGuildIdsChange = (value: string) => {
    setGuildIdsRaw(value);
    const parsed = value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    onBotChange({ allowed_guild_ids: parsed });
  };

  return (
    <SettingsCard>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={cn('text-sm font-semibold', PROVIDER_META.discord.colorClass)}>
            {PROVIDER_META.discord.label}
          </span>
          <ProviderStatusBadge status={status} />
        </div>
      </div>

      {/* Feature toggles */}
      <div className="mt-4 space-y-3">
        {/* Push notifications section */}
        <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-white/80">{i18n._(msg`notifications.pushNotifications`)}</div>
            <div className="text-[11px] text-white/30">{i18n._(msg`notifications.pushNotifications.desc`)}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={config.enabled}
              onCheckedChange={(checked) => onChange({ ...config, enabled: checked })}
            />
          </div>
        </div>
        <AnimatePresence>
          {config.enabled && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden"
            >
              <div className="space-y-3 pl-3 border-l-2 border-white/[0.06]">
                <Field>
                  <FieldLabel htmlFor="discord-webhook-url">Webhook URL</FieldLabel>
                  <PasswordInput
                    id="discord-webhook-url"
                    value={config.webhook_url}
                    onChange={(e) => onChange({ ...config, webhook_url: e.target.value })}
                    placeholder="https://discord.com/api/webhooks/..."
                    className={INPUT_CLASS}
                  />
                </Field>
                <TestButton provider="discord" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bot commands section */}
        <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-white/80">{i18n._(msg`notifications.botCommands`)}</div>
            <div className="text-[11px] text-white/30">{i18n._(msg`notifications.botCommands.shortDesc`)}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {botConfig.enabled && <TestBotButton platform="discord" />}
            <Switch
              checked={botConfig.enabled}
              onCheckedChange={(checked) => onBotChange({ enabled: checked })}
            />
          </div>
        </div>
        <AnimatePresence>
          {botConfig.enabled && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden"
            >
              <div className="space-y-3 pl-3 border-l-2 border-white/[0.06]">
                <Field>
                  <FieldLabel htmlFor="discord-bot-token">
                    {i18n._(msg`notifications.bot.botToken`)}
                  </FieldLabel>
                  <PasswordInput
                    id="discord-bot-token"
                    value={botConfig.bot_token}
                    onChange={(e) => onBotChange({ bot_token: e.target.value })}
                    placeholder="Bot token"
                    className={INPUT_CLASS}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="discord-bot-app-id">
                    {i18n._(msg`notifications.bot.applicationId`)}
                  </FieldLabel>
                  <Input
                    id="discord-bot-app-id"
                    value={botConfig.application_id}
                    onChange={(e) => onBotChange({ application_id: e.target.value })}
                    placeholder="123456789012345678"
                    className={INPUT_CLASS}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="discord-bot-guild-ids">
                    {i18n._(msg`notifications.bot.allowedGuildIds`)}
                  </FieldLabel>
                  <Input
                    id="discord-bot-guild-ids"
                    value={guildIdsRaw}
                    onChange={(e) => handleGuildIdsChange(e.target.value)}
                    placeholder="123456789012345678"
                    className={INPUT_CLASS}
                  />
                  <p className="mt-1 text-xs text-white/30">
                    {i18n._(msg`notifications.bot.allowedGuildIdsHelp`)}
                  </p>
                </Field>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SettingsCard>
  );
}

function TelegramCard({
  config,
  onChange,
  status,
  botConfig,
  onBotChange,
}: {
  config: NotificationSettings['providers']['telegram'];
  onChange: (c: NotificationSettings['providers']['telegram']) => void;
  status: ProviderStatus | undefined;
  botConfig: TelegramBotConfig;
  onBotChange: (updates: Partial<TelegramBotConfig>) => void;
}) {
  const { i18n } = useLingui();
  const isActive = config.enabled || botConfig.enabled;

  const [chatIdsRaw, setChatIdsRaw] = useState(
    (botConfig.allowed_chat_ids ?? []).join(', '),
  );
  useEffect(() => {
    setChatIdsRaw((botConfig.allowed_chat_ids ?? []).join(', '));
  }, [botConfig.allowed_chat_ids]);

  const handleChatIdsChange = (value: string) => {
    setChatIdsRaw(value);
    const parsed = value.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
      .map((s) => Number(s)).filter((n) => Number.isFinite(n));
    onBotChange({ allowed_chat_ids: parsed });
  };

  // Sync bot_token from push config → bot config when they share a token
  const sharedToken = config.bot_token;

  return (
    <SettingsCard>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={cn('text-sm font-semibold', PROVIDER_META.telegram.colorClass)}>
            {PROVIDER_META.telegram.label}
          </span>
          <ProviderStatusBadge status={status} />
        </div>
      </div>

      {/* Shared credentials */}
      <div className="mt-4 space-y-4">
        <Field>
          <FieldLabel htmlFor="telegram-bot-token">Bot Token</FieldLabel>
          <PasswordInput
            id="telegram-bot-token"
            value={config.bot_token}
            onChange={(e) => {
              onChange({ ...config, bot_token: e.target.value });
              onBotChange({ bot_token: e.target.value });
            }}
            placeholder="123456:ABC-DEF1234..."
            className={INPUT_CLASS}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="telegram-chat-id">Chat ID</FieldLabel>
          <Input
            id="telegram-chat-id"
            value={config.chat_id}
            onChange={(e) => onChange({ ...config, chat_id: e.target.value })}
            placeholder="123456789"
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      {/* Feature toggles */}
      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-white/80">{i18n._(msg`notifications.pushNotifications`)}</div>
            <div className="text-[11px] text-white/30">{i18n._(msg`notifications.pushNotifications.desc`)}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {config.enabled && <TestButton provider="telegram" />}
            <Switch
              checked={config.enabled}
              onCheckedChange={(checked) => onChange({ ...config, enabled: checked })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-white/80">{i18n._(msg`notifications.botCommands`)}</div>
            <div className="text-[11px] text-white/30">{i18n._(msg`notifications.botCommands.shortDesc`)}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {botConfig.enabled && <TestBotButton platform="telegram" />}
            <Switch
              checked={botConfig.enabled}
              onCheckedChange={(checked) => onBotChange({ enabled: checked, bot_token: sharedToken })}
            />
          </div>
        </div>
      </div>

      {/* Bot-specific settings */}
      <AnimatePresence>
        {botConfig.enabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-3 pl-3 border-l-2 border-white/[0.06]">
              {/* Bot Language */}
              <Field>
                <FieldLabel htmlFor="telegram-bot-lang">
                  {i18n._(msg`notifications.bot.language`)}
                </FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onBotChange({ language: '' })}
                    className={cn(
                      'px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer',
                      !botConfig.language
                        ? 'bg-white/[0.12] text-white'
                        : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'
                    )}
                  >
                    {i18n._(msg`notifications.bot.language.system`)}
                  </button>
                  {BOT_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => onBotChange({ language: lang.code })}
                      className={cn(
                        'px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer',
                        botConfig.language === lang.code
                          ? 'bg-white/[0.12] text-white'
                          : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'
                      )}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Airing Reminder */}
              <Field>
                <FieldLabel htmlFor="telegram-airing-reminder">
                  {i18n._(msg`notifications.bot.airingReminder`)}
                </FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {[0, 15, 30, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => onBotChange({ airing_reminder_minutes: mins })}
                      className={cn(
                        'px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer',
                        (botConfig.airing_reminder_minutes ?? 0) === mins
                          ? 'bg-white/[0.12] text-white'
                          : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'
                      )}
                    >
                      {mins === 0 ? i18n._(msg`notifications.bot.airingReminder.off`) : `${mins} min`}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-white/30">
                  {i18n._(msg`notifications.bot.airingReminder.desc`)}
                </p>
              </Field>

              {/* Allowed Chat IDs */}
              <Field>
                <FieldLabel htmlFor="telegram-bot-chat-ids">
                  {i18n._(msg`notifications.bot.allowedChatIds`)}
                </FieldLabel>
                <Input
                  id="telegram-bot-chat-ids"
                  value={chatIdsRaw}
                  onChange={(e) => handleChatIdsChange(e.target.value)}
                  placeholder="123456789, 987654321"
                  className={INPUT_CLASS}
                />
                <p className="mt-1 text-xs text-white/30">
                  {i18n._(msg`notifications.bot.allowedChatIdsHelp`)}
                </p>
              </Field>

              {/* Advanced: Webhook URL (collapsed by default) */}
              <details className="group">
                <summary className="text-[11px] text-white/25 cursor-pointer hover:text-white/40 transition-colors select-none">
                  {i18n._(msg`notifications.bot.advanced`)}
                </summary>
                <div className="mt-2 space-y-3">
                  <Field>
                    <FieldLabel htmlFor="telegram-bot-webhook-url">
                      {i18n._(msg`notifications.bot.webhookUrl`)}
                    </FieldLabel>
                    <Input
                      id="telegram-bot-webhook-url"
                      value={botConfig.webhook_url}
                      onChange={(e) => onBotChange({ webhook_url: e.target.value })}
                      placeholder="https://your-server.com/api/v1/bot/telegram/webhook"
                      className={INPUT_CLASS}
                    />
                    <p className="mt-1 text-xs text-white/20">
                      {i18n._(msg`notifications.bot.webhookUrlHelp`)}
                    </p>
                  </Field>
                </div>
              </details>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SettingsCard>
  );
}

function WebhookCard({
  config,
  onChange,
  status,
}: {
  config: NotificationSettings['providers']['webhook'];
  onChange: (c: NotificationSettings['providers']['webhook']) => void;
  status: ProviderStatus | undefined;
}) {
  const { i18n } = useLingui();
  const [showSecretField, setShowSecretField] = useState(!config.secret || !config.secret.includes('••••'));

  return (
    <SettingsCard>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={cn('text-sm font-semibold', PROVIDER_META.webhook.colorClass)}>
            {PROVIDER_META.webhook.label}
          </span>
          <ProviderStatusBadge status={status} />
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={(checked) => onChange({ ...config, enabled: checked })}
        />
      </div>
      <AnimatePresence>
        {config.enabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-4">
              <Field>
                <FieldLabel htmlFor="webhook-url">URL</FieldLabel>
                <PasswordInput
                  id="webhook-url"
                  value={config.url}
                  onChange={(e) => onChange({ ...config, url: e.target.value })}
                  placeholder="https://example.com/webhook"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="webhook-secret">
                  {i18n._(msg`notifications.secretPlaceholder`)}
                </FieldLabel>
                {!showSecretField && config.secret?.includes('••••') ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">
                      {i18n._(msg`notifications.secretIsSet`)}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowSecretField(true);
                        onChange({ ...config, secret: '' });
                      }}
                    >
                      {i18n._(msg`notifications.change`)}
                    </Button>
                  </div>
                ) : (
                  <PasswordInput
                    id="webhook-secret"
                    value={config.secret}
                    onChange={(e) => onChange({ ...config, secret: e.target.value })}
                    placeholder="HMAC signing secret (optional)"
                    className={INPUT_CLASS}
                  />
                )}
              </Field>
              <TestButton provider="webhook" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SettingsCard>
  );
}

// ─── Event Routing Matrix ───────────────────────────────────────────────────

function EventRoutingMatrix({
  events,
  enabledProviders,
  onChange,
}: {
  events: Record<string, string[]>;
  enabledProviders: ProviderName[];
  onChange: (events: Record<string, string[]>) => void;
}) {
  const { i18n } = useLingui();

  const toggleEvent = (eventId: string, provider: ProviderName) => {
    const current = events[eventId] ?? [];
    const next = current.includes(provider)
      ? current.filter((p) => p !== provider)
      : [...current, provider];
    onChange({ ...events, [eventId]: next });
  };

  if (enabledProviders.length === 0) {
    return (
      <SettingsCard>
        <p className="text-sm text-white/40 text-center py-4">
          {i18n._(msg`notifications.enableProviderAbove`)}
        </p>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard>
      <div className="mb-3 text-xs font-semibold uppercase tracking-[1px] text-white/50">
        {i18n._(msg`notifications.eventRouting`)}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left text-xs font-medium text-white/40 pb-2 pr-4">
                {i18n._(msg`notifications.event`)}
              </th>
              {enabledProviders.map((p) => (
                <th
                  key={p}
                  className={cn(
                    'text-center text-xs font-semibold pb-2 px-3',
                    PROVIDER_META[p].colorClass,
                  )}
                >
                  {PROVIDER_META[p].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_EVENTS.map((event) => {
              const meta = EVENT_LABEL_KEYS[event.id]!;
              return (
                <tr key={event.id} className="border-b border-white/[0.04] last:border-0">
                  <td className="py-3 pr-4">
                    <div className="text-sm text-white">{i18n._(meta.label)}</div>
                    <div className="text-xs text-white/40 mt-0.5">{i18n._(meta.desc)}</div>
                  </td>
                  {enabledProviders.map((p) => (
                    <td key={p} className="text-center px-3 py-3">
                      <div className="flex justify-center">
                        <Checkbox
                          checked={(events[event.id] ?? []).includes(p)}
                          onCheckedChange={() => toggleEvent(event.id, p)}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked */}
      <div className="lg:hidden space-y-4">
        {NOTIFICATION_EVENTS.map((event) => {
          const meta = EVENT_LABEL_KEYS[event.id]!;
          return (
            <div key={event.id} className="space-y-2">
              <div>
                <div className="text-sm text-white">{i18n._(meta.label)}</div>
                <div className="text-xs text-white/40 mt-0.5">{i18n._(meta.desc)}</div>
              </div>
              <div className="flex flex-wrap gap-3">
                {enabledProviders.map((p) => (
                  <label
                    key={p}
                    className="flex items-center gap-1.5 text-xs text-white/60 cursor-pointer"
                  >
                    <Checkbox
                      size={16}
                      checked={(events[event.id] ?? []).includes(p)}
                      onCheckedChange={() => toggleEvent(event.id, p)}
                    />
                    <span className={PROVIDER_META[p].colorClass}>{PROVIDER_META[p].label}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </SettingsCard>
  );
}

// ─── Skeleton Loader ────────────────────────────────────────────────────────

function SkeletonCards() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-[10px] border border-white/[0.06] bg-white/[0.025] p-4 px-5"
        >
          <div className="flex items-center justify-between">
            <div className="h-4 w-24 rounded bg-white/[0.06] animate-pulse" />
            <div className="h-4 w-8 rounded-full bg-white/[0.06] animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export function NotificationSettingsPanel() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const { data: serverSettings, isLoading } = useQuery({
    queryKey: notificationSettingsKeys.settings(),
    queryFn: () => notificationSettingsApi.get(),
  });

  const { data: statuses } = useQuery({
    queryKey: notificationSettingsKeys.status(),
    queryFn: () => notificationSettingsApi.status(),
    refetchInterval: 30_000,
  });

  const { data: globalSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, any>>('/api/v1/settings'),
    staleTime: 60_000,
  });
  const docsUrl = (globalSettings?.general?.docs_url as string) || '';

  const [local, setLocal] = useState<NotificationSettings | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Sync server data into local state when it arrives
  useEffect(() => {
    if (serverSettings && !isDirty) {
      const defaults = defaultSettings();
      const srvTelegram = serverSettings.bot?.telegram ?? {};
      const srvDiscord = serverSettings.bot?.discord ?? {};
      setLocal({
        providers: { ...defaults.providers, ...serverSettings.providers },
        events: serverSettings.events ?? {},
        bot: {
          telegram: {
            ...defaults.bot.telegram,
            ...srvTelegram,
            allowed_chat_ids: srvTelegram.allowed_chat_ids ?? [],
          },
          discord: {
            ...defaults.bot.discord,
            ...srvDiscord,
            allowed_guild_ids: srvDiscord.allowed_guild_ids ?? [],
          },
        },
      });
    }
  }, [serverSettings, isDirty]);

  const saveMutation = useMutation({
    mutationFn: (data: NotificationSettings) => notificationSettingsApi.update(data),
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: notificationSettingsKeys.settings() });
      queryClient.invalidateQueries({ queryKey: notificationSettingsKeys.status() });
    },
  });

  const settings = local ?? defaultSettings();

  const updateProvider = <K extends ProviderName>(
    provider: K,
    config: NotificationSettings['providers'][K],
  ) => {
    setLocal((prev) => {
      const base = prev ?? defaultSettings();
      return { ...base, providers: { ...base.providers, [provider]: config } };
    });
    setIsDirty(true);
  };

  const updateTelegramBot = (updates: Partial<TelegramBotConfig>) => {
    setLocal((prev) => {
      const base = prev ?? defaultSettings();
      return {
        ...base,
        bot: { ...base.bot, telegram: { ...base.bot.telegram, ...updates } },
      };
    });
    setIsDirty(true);
  };

  const updateDiscordBot = (updates: Partial<DiscordBotConfig>) => {
    setLocal((prev) => {
      const base = prev ?? defaultSettings();
      return {
        ...base,
        bot: { ...base.bot, discord: { ...base.bot.discord, ...updates } },
      };
    });
    setIsDirty(true);
  };

  const updateEvents = (events: Record<string, string[]>) => {
    setLocal((prev) => {
      const base = prev ?? defaultSettings();
      return { ...base, events };
    });
    setIsDirty(true);
  };

  const enabledProviders = PROVIDERS.filter((p) => settings.providers[p].enabled);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white">
            {i18n._(msg`settings.nav.notifications`)}
          </h2>
          <p className="mt-1 text-sm text-white/40">
            {i18n._(msg`notifications.intro`)}
          </p>
        </div>
        <SkeletonCards />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">
            {i18n._(msg`settings.nav.notifications`)}
          </h2>
          <p className="mt-1 text-sm text-white/40">
            {i18n._(msg`notifications.intro`)}
          </p>
        </div>
        {docsUrl && (
          <a
            href={`${docsUrl}/docs/configuration/notifications`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs text-white/30 hover:text-white/60 transition-colors mt-1"
          >
            {i18n._(msg`notifications.setupGuide`)} ↗
          </a>
        )}
      </div>

      {/* Platform Cards (push + bot unified per platform) */}
      <div className="space-y-4">
        <TelegramCard
          config={settings.providers.telegram}
          onChange={(c) => updateProvider('telegram', c)}
          status={statuses?.telegram}
          botConfig={settings.bot.telegram}
          onBotChange={updateTelegramBot}
        />
        <DiscordCard
          config={settings.providers.discord}
          onChange={(c) => updateProvider('discord', c)}
          status={statuses?.discord}
          botConfig={settings.bot.discord}
          onBotChange={updateDiscordBot}
        />
        <WebhookCard
          config={settings.providers.webhook}
          onChange={(c) => updateProvider('webhook', c)}
          status={statuses?.webhook}
        />
      </div>

      {/* Event Routing */}
      <EventRoutingMatrix
        events={settings.events ?? {}}
        enabledProviders={enabledProviders}
        onChange={updateEvents}
      />

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          type="button"
          disabled={!isDirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate(settings)}
        >
          {saveMutation.isPending
            ? i18n._(msg`settings.saving`)
            : i18n._(msg`settings.save`)}
        </Button>
      </div>
    </div>
  );
}
