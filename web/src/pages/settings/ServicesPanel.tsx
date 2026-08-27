import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Delete02Icon,
  QrCode01Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { api, ApiError } from '@/lib/api-client';
import {
  type JellyfinDevice,
  type Service,
  type ServicesResponse,
  servicesApi,
  servicesKeys,
} from '@/lib/api/services';
import { cn } from '@/lib/utils';
import { Skeleton, SkeletonText } from '../../components/Skeleton';

// ── Naming ──────────────────────────────────────────────────────────────────

const SERVICE_NAMES: Record<string, MessageDescriptor> = {
  jellyfin: msg`services.name.jellyfin`,
  'worker.rss_refresh': msg`services.name.worker.rss_refresh`,
  'worker.download_sync': msg`services.name.worker.download_sync`,
  'worker.library_reconcile': msg`services.name.worker.library_reconcile`,
  'worker.notification_delivery': msg`services.name.worker.notification_delivery`,
  'worker.bot_report': msg`services.name.worker.bot_report`,
  'worker.airing_reminder': msg`services.name.worker.airing_reminder`,
  'worker.daily_digest': msg`services.name.worker.daily_digest`,
  'worker.anidb_refresh': msg`services.name.worker.anidb_refresh`,
  'worker.sync_outbox_drain': msg`services.name.worker.sync_outbox_drain`,
  'worker.sync_outbox_gc': msg`services.name.worker.sync_outbox_gc`,
  'worker.sync_pull': msg`services.name.worker.sync_pull`,
  'worker.notification_cleanup': msg`services.name.worker.notification_cleanup`,
  downloader: msg`services.name.downloader`,
  transcode_cache: msg`services.name.transcode_cache`,
  sync: msg`services.name.sync`,
  backup: msg`services.name.backup`,
  'bot.telegram': msg`services.name.bot.telegram`,
  'bot.discord': msg`services.name.bot.discord`,
};

// ── Formatting ──────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatInterval(seconds: number | null): string {
  if (!seconds) return '';
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatRelative(iso: string | null, locale: string): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(diff, 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

type Health = 'ok' | 'error' | 'off' | 'running';

function healthOf(service: Service): Health {
  if (!service.enabled) return 'off';
  if (service.running) return 'running';
  if (service.last_error) return 'error';
  return 'ok';
}

function StatusDot({ health }: { health: Health }) {
  return (
    <span
      data-testid="service-status"
      data-health={health}
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        health === 'ok' && 'bg-emerald-400',
        health === 'error' && 'bg-red-400',
        health === 'running' && 'bg-mm-accent animate-pulse',
        health === 'off' && 'bg-ink/20'
      )}
    />
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────

export function ServicesPanel() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: servicesKeys.list(),
    queryFn: servicesApi.list,
    refetchInterval: 30_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: servicesKeys.list() });

  const patchMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      servicesApi.patch(id, { enabled }),
    onMutate: async ({ id, enabled }) => {
      await queryClient.cancelQueries({ queryKey: servicesKeys.list() });
      const previous = queryClient.getQueryData<ServicesResponse>(servicesKeys.list());
      queryClient.setQueryData<ServicesResponse>(servicesKeys.list(), (current) =>
        current
          ? {
              ...current,
              services: current.services.map((s) => (s.id === id ? { ...s, enabled } : s)),
            }
          : current
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(servicesKeys.list(), context.previous);
      toast.error(i18n._(msg`services.toast.updateFailed`));
    },
    onSettled: invalidate,
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => servicesApi.run(id),
    onSuccess: () => {
      toast.success(i18n._(msg`services.toast.runStarted`));
      void invalidate();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        toast.info(i18n._(msg`services.toast.alreadyRunning`));
      } else {
        toast.error(i18n._(msg`services.toast.runFailed`));
      }
    },
  });

  if (query.isPending) return <ServicesSkeleton />;
  if (query.isError || !query.data) {
    return (
      <div>
        <Header i18n={i18n} />
        <SettingsCard>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-ink/60">{i18n._(msg`services.error.load`)}</p>
            <Button type="button" variant="outline" onClick={() => query.refetch()}>
              {i18n._(msg`common.retry`)}
            </Button>
          </div>
        </SettingsCard>
      </div>
    );
  }

  const { services, system } = query.data;
  const byId = new Map(services.map((s) => [s.id, s]));
  const jellyfin = byId.get('jellyfin');
  const workers = services
    .filter((s) => s.id.startsWith('worker.'))
    .sort((a, b) => Number(Boolean(b.last_error)) - Number(Boolean(a.last_error)));
  const others = ['downloader', 'transcode_cache', 'sync', 'backup', 'bot.telegram', 'bot.discord']
    .map((id) => byId.get(id))
    .filter((s): s is Service => !!s);
  const failing = services.filter((s) => s.enabled && s.last_error).length;

  return (
    <div>
      <Header i18n={i18n} />

      <div className="space-y-3">
        <SettingsCard>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-ink/50">
            <span>
              milmil <span className="text-ink tabular-nums">{system.version}</span>
            </span>
            <span>
              {i18n._(msg`services.system.uptime`)}{' '}
              <span className="text-ink tabular-nums">{formatUptime(system.uptime_seconds)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <StatusDot health={failing > 0 ? 'error' : 'ok'} />
              {failing > 0
                ? i18n._(msg`services.system.failing`).replace('{count}', String(failing))
                : i18n._(msg`services.system.allHealthy`)}
            </span>
          </div>
        </SettingsCard>

        {jellyfin && (
          <JellyfinCard
            service={jellyfin}
            onToggle={(enabled) => patchMutation.mutate({ id: jellyfin.id, enabled })}
            onToggleDiscovery={(discovery) =>
              servicesApi
                .patch(jellyfin.id, { discovery_enabled: discovery })
                .then(invalidate)
                .catch(() => toast.error(i18n._(msg`services.toast.updateFailed`)))
            }
          />
        )}

        <SettingsCard label={i18n._(msg`services.workers.title`)}>
          <div className="divide-y divide-ink/[0.06]" data-testid="services-workers">
            {workers.map((service) => (
              <ServiceRow
                key={service.id}
                service={service}
                locale={i18n.locale}
                onToggle={(enabled) => patchMutation.mutate({ id: service.id, enabled })}
                onRun={() => runMutation.mutate(service.id)}
                running={runMutation.isPending && runMutation.variables === service.id}
              />
            ))}
          </div>
        </SettingsCard>

        <SettingsCard label={i18n._(msg`services.other.title`)}>
          <div className="divide-y divide-ink/[0.06]" data-testid="services-other">
            {others.map((service) => (
              <ServiceRow
                key={service.id}
                service={service}
                locale={i18n.locale}
                onToggle={(enabled) => patchMutation.mutate({ id: service.id, enabled })}
                onRun={() => runMutation.mutate(service.id)}
                running={runMutation.isPending && runMutation.variables === service.id}
                action={<ServiceAction service={service} onDone={invalidate} />}
              />
            ))}
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}

function Header({ i18n }: { i18n: ReturnType<typeof useLingui>['i18n'] }) {
  return (
    <>
      <h2 className="text-xl font-semibold text-ink">{i18n._(msg`settings.nav.services`)}</h2>
      <p className="mt-1 mb-6 text-xs text-ink/35">{i18n._(msg`services.subtitle`)}</p>
    </>
  );
}

function ServicesSkeleton() {
  return (
    <div data-testid="services-skeleton" className="space-y-3">
      <SkeletonText className="h-7 w-32" />
      <SkeletonText className="w-64" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24 rounded-[10px] bg-ink/[0.03]" />
      ))}
    </div>
  );
}

// ── Rows ────────────────────────────────────────────────────────────────────

function ServiceRow({
  service,
  locale,
  onToggle,
  onRun,
  running,
  action,
}: {
  service: Service;
  locale: string;
  onToggle: (enabled: boolean) => void;
  onRun: () => void;
  running: boolean;
  action?: React.ReactNode;
}) {
  const { i18n } = useLingui();
  const descriptor = SERVICE_NAMES[service.id];
  const name = descriptor ? i18n._(descriptor) : service.name;
  const health = healthOf(service);
  const meta = [
    service.interval_seconds
      ? `${i18n._(msg`services.row.every`)} ${formatInterval(service.interval_seconds)}`
      : '',
    service.last_run_at ? formatRelative(service.last_run_at, locale) : '',
    formatDuration(service.last_duration_ms),
    service.summary,
  ].filter(Boolean);

  return (
    <div
      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
      data-testid={`service-${service.id}`}
    >
      <StatusDot health={health} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn('text-sm', service.enabled ? 'text-ink' : 'text-ink/50')}>
            {name}
          </span>
          <span className="truncate text-[11px] text-ink/35 tabular-nums">{meta.join(' · ')}</span>
        </div>
        {service.last_error && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-red-400">
            <HugeiconsIcon icon={Alert02Icon} size={12} />
            {service.last_error}
          </p>
        )}
      </div>
      {action}
      {service.runnable && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!service.enabled || service.running || running}
          onClick={onRun}
          aria-label={`${i18n._(msg`services.row.runNow`)}: ${name}`}
        >
          <HugeiconsIcon
            icon={RefreshIcon}
            size={14}
            className={cn(service.running && 'animate-spin')}
          />
          <span className="hidden sm:inline">{i18n._(msg`services.row.runNow`)}</span>
        </Button>
      )}
      {service.controllable && (
        <Switch
          checked={service.enabled}
          onCheckedChange={onToggle}
          aria-label={`${name}: ${i18n._(msg`services.row.enabled`)}`}
        />
      )}
    </div>
  );
}

/// Buttons for the non-worker rows whose actions already exist elsewhere in the API.
function ServiceAction({ service, onDone }: { service: Service; onDone: () => void }) {
  const { i18n } = useLingui();
  const clearCache = useMutation({
    mutationFn: () => api.delete('/api/v1/system/transcode-cache'),
    onSuccess: () => {
      toast.success(i18n._(msg`settings.storage.cleared`));
      onDone();
    },
    onError: () => toast.error(i18n._(msg`settings.storage.clearFailed`)),
  });
  const syncNow = useMutation({
    mutationFn: () => api.post<unknown>('/api/v1/user/preferences/sync'),
    onSuccess: () => {
      toast.success(i18n._(msg`backup.syncSuccess`));
      onDone();
    },
    onError: () => toast.error(i18n._(msg`services.toast.runFailed`)),
  });

  if (service.id === 'transcode_cache') {
    const bytes = typeof service.extra?.bytes === 'number' ? service.extra.bytes : 0;
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={bytes === 0 || clearCache.isPending}
        onClick={() => clearCache.mutate()}
      >
        <HugeiconsIcon icon={Delete02Icon} size={14} />
        {i18n._(msg`services.row.clear`)} · {formatBytes(bytes)}
      </Button>
    );
  }
  if (service.id === 'sync') {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={syncNow.isPending}
        onClick={() => syncNow.mutate()}
      >
        <HugeiconsIcon icon={RefreshIcon} size={14} />
        {i18n._(msg`services.row.syncNow`)}
      </Button>
    );
  }
  return null;
}

// ── Jellyfin ────────────────────────────────────────────────────────────────

function JellyfinCard({
  service,
  onToggle,
  onToggleDiscovery,
}: {
  service: Service;
  onToggle: (enabled: boolean) => void;
  onToggleDiscovery: (enabled: boolean) => void;
}) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [showQR, setShowQR] = useState(false);
  const address = typeof service.extra?.address === 'string' ? service.extra.address : '';
  const discovery = service.extra?.discovery_enabled === true;

  const devices = useQuery({
    queryKey: servicesKeys.jellyfinDevices(),
    queryFn: servicesApi.jellyfinDevices,
    enabled: service.enabled,
  });

  const revoke = useMutation({
    mutationFn: (deviceId: string) => servicesApi.revokeJellyfinDevice(deviceId),
    onSuccess: () => {
      toast.success(i18n._(msg`services.jellyfin.revoked`));
      void queryClient.invalidateQueries({ queryKey: servicesKeys.jellyfinDevices() });
      void queryClient.invalidateQueries({ queryKey: servicesKeys.list() });
    },
    onError: () => toast.error(i18n._(msg`services.toast.updateFailed`)),
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast.success(i18n._(msg`services.jellyfin.copied`));
    } catch {
      toast.error(i18n._(msg`services.toast.updateFailed`));
    }
  };

  return (
    <SettingsCard label={i18n._(msg`services.jellyfin.title`)}>
      <div className="space-y-3" data-testid="service-jellyfin">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-ink">{i18n._(msg`services.jellyfin.desc`)}</p>
            {service.last_error && (
              <p className="mt-0.5 text-[11px] text-red-400">{service.last_error}</p>
            )}
          </div>
          <Switch
            checked={service.enabled}
            onCheckedChange={onToggle}
            aria-label={i18n._(msg`services.jellyfin.enabled`)}
          />
        </div>

        {service.enabled && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <code
                data-testid="jellyfin-address"
                className="rounded bg-ink/[0.05] px-2 py-1 text-xs text-ink/80 select-all"
              >
                {address || '—'}
              </code>
              <Button type="button" variant="ghost" size="sm" onClick={copy} disabled={!address}>
                <HugeiconsIcon icon={Copy01Icon} size={14} />
                {i18n._(msg`services.jellyfin.copy`)}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowQR((v) => !v)}
                disabled={!address}
                aria-pressed={showQR}
              >
                <HugeiconsIcon icon={QrCode01Icon} size={14} />
                QR
              </Button>
            </div>
            {showQR && address && (
              <div className="inline-block rounded-lg bg-white p-3" data-testid="jellyfin-qr">
                <QRCodeSVG value={address} size={160} />
              </div>
            )}
            <p className="text-[11px] text-ink/40">{i18n._(msg`services.jellyfin.loginHint`)}</p>

            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-ink/60">
                {i18n._(msg`services.jellyfin.discovery`)}
                {typeof service.extra?.discovery_port === 'number' && (
                  <span className="text-ink/35"> · UDP {service.extra.discovery_port}</span>
                )}
              </span>
              <Switch
                checked={discovery}
                onCheckedChange={onToggleDiscovery}
                aria-label={i18n._(msg`services.jellyfin.discovery`)}
              />
            </div>

            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-[1px] text-ink/40">
                {i18n._(msg`services.jellyfin.devices`)}
              </div>
              {devices.data?.devices.length ? (
                <div className="divide-y divide-ink/[0.06]" data-testid="jellyfin-devices">
                  {devices.data.devices.map((device) => (
                    <DeviceRow
                      key={device.device_id}
                      device={device}
                      locale={i18n.locale}
                      onRevoke={() => revoke.mutate(device.device_id)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink/35">{i18n._(msg`services.jellyfin.noDevices`)}</p>
              )}
            </div>
          </>
        )}
      </div>
    </SettingsCard>
  );
}

function DeviceRow({
  device,
  locale,
  onRevoke,
}: {
  device: JellyfinDevice;
  locale: string;
  onRevoke: () => void;
}) {
  const { i18n } = useLingui();
  return (
    <div className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        size={14}
        className={cn(device.revoked ? 'text-ink/25' : 'text-emerald-400')}
      />
      <div className="min-w-0 flex-1">
        <span className={cn('text-sm', device.revoked ? 'text-ink/40 line-through' : 'text-ink')}>
          {device.client}
          {device.device_name ? ` · ${device.device_name}` : ''}
        </span>
        <span className="ml-2 text-[11px] text-ink/35">
          {formatRelative(device.last_seen, locale)}
        </span>
      </div>
      {!device.revoked && (
        <Button type="button" variant="ghost" size="sm" onClick={onRevoke}>
          {i18n._(msg`services.jellyfin.revoke`)}
        </Button>
      )}
    </div>
  );
}
