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
      telegram: { enabled: false, bot_token: '', webhook_url: '', allowed_chat_ids: [] },
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={testMutation.isPending}
        onClick={() => {
          setResult(null);
          testMutation.mutate();
        }}
      >
        {testMutation.isPending ? (
          <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
        ) : (
          i18n._(msg`notifications.test`)
        )}
      </Button>
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

// ─── Provider Cards ─────────────────────────────────────────────────────────

function DiscordCard({
  config,
  onChange,
  status,
}: {
  config: NotificationSettings['providers']['discord'];
  onChange: (c: NotificationSettings['providers']['discord']) => void;
  status: ProviderStatus | undefined;
}) {
  return (
    <SettingsCard>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={cn('text-sm font-semibold', PROVIDER_META.discord.colorClass)}>
            {PROVIDER_META.discord.label}
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
    </SettingsCard>
  );
}

function TelegramCard({
  config,
  onChange,
  status,
}: {
  config: NotificationSettings['providers']['telegram'];
  onChange: (c: NotificationSettings['providers']['telegram']) => void;
  status: ProviderStatus | undefined;
}) {
  return (
    <SettingsCard>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={cn('text-sm font-semibold', PROVIDER_META.telegram.colorClass)}>
            {PROVIDER_META.telegram.label}
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
                <FieldLabel htmlFor="telegram-bot-token">Bot Token</FieldLabel>
                <PasswordInput
                  id="telegram-bot-token"
                  value={config.bot_token}
                  onChange={(e) => onChange({ ...config, bot_token: e.target.value })}
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
                  placeholder="-1001234567890"
                  className={INPUT_CLASS}
                />
              </Field>
              <TestButton provider="telegram" />
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

// ─── Bot Command Cards ──────────────────────────────────────────────────────

function TelegramBotCard({
  config,
  onChange,
}: {
  config: TelegramBotConfig;
  onChange: (updates: Partial<TelegramBotConfig>) => void;
}) {
  const { i18n } = useLingui();
  const [showTokenField, setShowTokenField] = useState(
    !config.bot_token || !config.bot_token.includes('••••'),
  );
  const [chatIdsRaw, setChatIdsRaw] = useState(config.allowed_chat_ids.join(', '));

  useEffect(() => {
    setChatIdsRaw(config.allowed_chat_ids.join(', '));
  }, [config.allowed_chat_ids]);

  const handleChatIdsChange = (value: string) => {
    setChatIdsRaw(value);
    const parsed = value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
    onChange({ allowed_chat_ids: parsed });
  };

  return (
    <SettingsCard>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={cn('text-sm font-semibold', PROVIDER_META.telegram.colorClass)}>
            {i18n._(msg`notifications.bot.telegram`)}
          </span>
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={(checked) => onChange({ enabled: checked })}
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
                <FieldLabel htmlFor="telegram-bot-cmd-token">
                  {i18n._(msg`notifications.bot.botToken`)}
                </FieldLabel>
                {!showTokenField && config.bot_token?.includes('••••') ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">
                      {i18n._(msg`notifications.secretIsSet`)}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowTokenField(true);
                        onChange({ bot_token: '' });
                      }}
                    >
                      {i18n._(msg`notifications.change`)}
                    </Button>
                  </div>
                ) : (
                  <PasswordInput
                    id="telegram-bot-cmd-token"
                    value={config.bot_token}
                    onChange={(e) => onChange({ bot_token: e.target.value })}
                    placeholder="123456:ABC-DEF1234..."
                    className={INPUT_CLASS}
                  />
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="telegram-bot-webhook-url">
                  {i18n._(msg`notifications.bot.webhookUrl`)}
                </FieldLabel>
                <Input
                  id="telegram-bot-webhook-url"
                  value={config.webhook_url}
                  onChange={(e) => onChange({ webhook_url: e.target.value })}
                  placeholder="https://example.com/telegram/webhook"
                  className={INPUT_CLASS}
                />
                <p className="mt-1 text-xs text-white/40">
                  {i18n._(msg`notifications.bot.webhookUrlHelp`)}
                </p>
              </Field>
              <Field>
                <FieldLabel htmlFor="telegram-bot-chat-ids">
                  {i18n._(msg`notifications.bot.allowedChatIds`)}
                </FieldLabel>
                <Input
                  id="telegram-bot-chat-ids"
                  value={chatIdsRaw}
                  onChange={(e) => handleChatIdsChange(e.target.value)}
                  placeholder="123456789, -1001234567890"
                  className={INPUT_CLASS}
                />
                <p className="mt-1 text-xs text-white/40">
                  {i18n._(msg`notifications.bot.allowedChatIdsHelp`)}
                </p>
              </Field>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SettingsCard>
  );
}

function DiscordBotCard({
  config,
  onChange,
}: {
  config: DiscordBotConfig;
  onChange: (updates: Partial<DiscordBotConfig>) => void;
}) {
  const { i18n } = useLingui();
  const [showTokenField, setShowTokenField] = useState(
    !config.bot_token || !config.bot_token.includes('••••'),
  );
  const [guildIdsRaw, setGuildIdsRaw] = useState(config.allowed_guild_ids.join(', '));

  useEffect(() => {
    setGuildIdsRaw(config.allowed_guild_ids.join(', '));
  }, [config.allowed_guild_ids]);

  const handleGuildIdsChange = (value: string) => {
    setGuildIdsRaw(value);
    const parsed = value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    onChange({ allowed_guild_ids: parsed });
  };

  return (
    <SettingsCard>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={cn('text-sm font-semibold', PROVIDER_META.discord.colorClass)}>
            {i18n._(msg`notifications.bot.discord`)}
          </span>
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={(checked) => onChange({ enabled: checked })}
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
                <FieldLabel htmlFor="discord-bot-cmd-token">
                  {i18n._(msg`notifications.bot.botToken`)}
                </FieldLabel>
                {!showTokenField && config.bot_token?.includes('••••') ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">
                      {i18n._(msg`notifications.secretIsSet`)}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowTokenField(true);
                        onChange({ bot_token: '' });
                      }}
                    >
                      {i18n._(msg`notifications.change`)}
                    </Button>
                  </div>
                ) : (
                  <PasswordInput
                    id="discord-bot-cmd-token"
                    value={config.bot_token}
                    onChange={(e) => onChange({ bot_token: e.target.value })}
                    placeholder="Bot token"
                    className={INPUT_CLASS}
                  />
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="discord-bot-app-id">
                  {i18n._(msg`notifications.bot.applicationId`)}
                </FieldLabel>
                <Input
                  id="discord-bot-app-id"
                  value={config.application_id}
                  onChange={(e) => onChange({ application_id: e.target.value })}
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
                  placeholder="123456789012345678, 987654321098765432"
                  className={INPUT_CLASS}
                />
                <p className="mt-1 text-xs text-white/40">
                  {i18n._(msg`notifications.bot.allowedGuildIdsHelp`)}
                </p>
              </Field>
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

  const [local, setLocal] = useState<NotificationSettings | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Sync server data into local state when it arrives
  useEffect(() => {
    if (serverSettings && !isDirty) {
      const defaults = defaultSettings();
      setLocal({
        providers: { ...defaults.providers, ...serverSettings.providers },
        events: serverSettings.events ?? {},
        bot: {
          telegram: { ...defaults.bot.telegram, ...(serverSettings.bot?.telegram ?? {}) },
          discord: { ...defaults.bot.discord, ...(serverSettings.bot?.discord ?? {}) },
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
    const next = {
      ...settings,
      providers: { ...settings.providers, [provider]: config },
    };
    setLocal(next);
    setIsDirty(true);
  };

  const updateTelegramBot = (updates: Partial<TelegramBotConfig>) => {
    const next = {
      ...settings,
      bot: {
        ...settings.bot,
        telegram: { ...settings.bot.telegram, ...updates },
      },
    };
    setLocal(next);
    setIsDirty(true);
  };

  const updateDiscordBot = (updates: Partial<DiscordBotConfig>) => {
    const next = {
      ...settings,
      bot: {
        ...settings.bot,
        discord: { ...settings.bot.discord, ...updates },
      },
    };
    setLocal(next);
    setIsDirty(true);
  };

  const updateEvents = (events: Record<string, string[]>) => {
    const next = { ...settings, events };
    setLocal(next);
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
      <div>
        <h2 className="text-xl font-bold text-white">
          {i18n._(msg`settings.nav.notifications`)}
        </h2>
        <p className="mt-1 text-sm text-white/40">
          {i18n._(msg`notifications.intro`)}
        </p>
      </div>

      {/* Provider Cards */}
      <div className="space-y-4">
        <DiscordCard
          config={settings.providers.discord}
          onChange={(c) => updateProvider('discord', c)}
          status={statuses?.discord}
        />
        <TelegramCard
          config={settings.providers.telegram}
          onChange={(c) => updateProvider('telegram', c)}
          status={statuses?.telegram}
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

      {/* Bot Commands */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white">
            {i18n._(msg`notifications.botCommands`)}
          </h3>
          <p className="mt-1 text-xs text-white/40">
            {i18n._(msg`notifications.botCommands.desc`)}
          </p>
        </div>
        <TelegramBotCard
          config={settings.bot.telegram}
          onChange={updateTelegramBot}
        />
        <DiscordBotCard
          config={settings.bot.discord}
          onChange={updateDiscordBot}
        />
      </div>

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
