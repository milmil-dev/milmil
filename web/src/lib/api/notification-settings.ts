import { api } from '../api-client';

export interface DiscordConfig {
  enabled: boolean;
  webhook_url: string;
}

export interface TelegramConfig {
  enabled: boolean;
  bot_token: string;
  chat_id: string;
}

export interface WebhookConfig {
  enabled: boolean;
  url: string;
  secret: string;
}

export interface ProvidersConfig {
  discord: DiscordConfig;
  telegram: TelegramConfig;
  webhook: WebhookConfig;
}

export interface TelegramBotConfig {
  enabled: boolean;
  bot_token: string;
  webhook_url: string;
  allowed_chat_ids: number[];
}

export interface DiscordBotConfig {
  enabled: boolean;
  bot_token: string;
  application_id: string;
  allowed_guild_ids: string[];
}

export interface BotConfig {
  telegram: TelegramBotConfig;
  discord: DiscordBotConfig;
}

export interface NotificationSettings {
  providers: ProvidersConfig;
  events: Record<string, string[]>;
  bot: BotConfig;
}

export interface ProviderStatus {
  status: 'ok' | 'error' | 'unconfigured';
  last_sent_at: string | null;
  last_error: string | null;
}

export const notificationSettingsApi = {
  get: () => api.get<NotificationSettings>('/api/v1/settings/notifications'),
  update: (data: NotificationSettings) => api.put<void>('/api/v1/settings/notifications', data),
  test: (provider: string) =>
    api.post<{ success: boolean; error?: string }>('/api/v1/settings/notifications/test', {
      provider,
    }),
  status: () => api.get<Record<string, ProviderStatus>>('/api/v1/settings/notifications/status'),
};

export const notificationSettingsKeys = {
  settings: () => ['notification-settings'] as const,
  status: () => ['notification-settings', 'status'] as const,
};

export const NOTIFICATION_EVENTS = [
  { id: 'download.started', labelKey: 'notifications.event.downloadStarted' },
  { id: 'download.completed', labelKey: 'notifications.event.downloadCompleted' },
  { id: 'download.failed', labelKey: 'notifications.event.downloadFailed' },
  { id: 'library.scan_complete', labelKey: 'notifications.event.libraryScanComplete' },
  { id: 'system.error', labelKey: 'notifications.event.systemError' },
] as const;

export const PROVIDERS = ['discord', 'telegram', 'webhook'] as const;
export type ProviderName = (typeof PROVIDERS)[number];
