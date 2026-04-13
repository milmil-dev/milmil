import { Notification03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { PageTransition } from '../components/PageTransition';
import { Skeleton } from '../components/Skeleton';
import { Button } from '../components/ui/button';
import { useDocumentTitle } from '../hooks/use-document-title';
import {
  type Notification,
  notificationApi,
  notificationKeys,
} from '../lib/api/notifications';
import { cn } from '../lib/utils';

/* ── Time helpers ─────────────────────────────────────────── */

function getTimeGroup(dateStr: string): 'today' | 'yesterday' | 'earlier' {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  if (date >= today) return 'today';
  if (date >= yesterday) return 'yesterday';
  return 'earlier';
}

function timeAgo(dateStr: string, i18n: { _: (descriptor: any) => string }): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return i18n._(msg`time.secondsAgo ${seconds}`);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return i18n._(msg`time.minutesAgo ${minutes}`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return i18n._(msg`time.hoursAgo ${hours}`);
  const days = Math.floor(hours / 24);
  return i18n._(msg`time.daysAgo ${days}`);
}

/* ── Filter tabs ──────────────────────────────────────────── */

const FILTER_TABS = [
  { value: 'all', msgKey: msg`notifications.filter.all` },
  { value: 'download', msgKey: msg`notifications.filter.downloads` },
  { value: 'library', msgKey: msg`notifications.filter.library` },
  { value: 'system', msgKey: msg`notifications.filter.system` },
] as const;

const SEVERITY_BORDER: Record<string, string> = {
  success: 'border-l-green-400',
  info: 'border-l-blue-400',
  error: 'border-l-red-400',
};

const TYPE_BADGE: Record<string, string> = {
  download: 'bg-blue-500/15 text-blue-400',
  library: 'bg-green-500/15 text-green-400',
  system: 'bg-amber-500/15 text-amber-400',
};

const TYPE_LABEL_KEYS: Record<string, ReturnType<typeof msg>> = {
  download: msg`notifications.filter.downloads`,
  library: msg`notifications.filter.library`,
  system: msg`notifications.filter.system`,
};

/* Map backend notification type -> translated title */
const NOTIFICATION_TITLE_KEYS: Record<string, ReturnType<typeof msg>> = {
  'download.started': msg`notifications.type.newEpisode`,
  'download.completed': msg`notifications.type.downloadComplete`,
  'download.failed': msg`notifications.type.downloadFailed`,
  'library.scan_complete': msg`notifications.type.libraryScanComplete`,
  'system.error': msg`notifications.type.systemError`,
};

/* ── Time group label mapping ─────────────────────────────── */

const TIME_GROUP_KEYS = {
  today: msg`notifications.today`,
  yesterday: msg`notifications.yesterday`,
  earlier: msg`notifications.earlier`,
} as const;

/* ── Page ─────────────────────────────────────────────────── */

const PAGE_SIZE = 20;

export function NotificationsPage() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(PAGE_SIZE);

  useDocumentTitle(i18n._(msg`notifications.title`));

  const { data: notifications, isLoading } = useQuery({
    queryKey: [...notificationKeys.list(filter), limit],
    queryFn: () =>
      notificationApi.list({
        limit,
        filter: filter === 'all' ? undefined : filter,
      }),
  });

  const markReadMut = useMutation({
    mutationFn: notificationApi.markRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllMut = useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const clearMut = useMutation({
    mutationFn: notificationApi.clear,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Group notifications by time
  const grouped = groupByTime(notifications ?? []);

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">
            {i18n._(msg`notifications.title`)}
          </h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllMut.mutate(undefined)}
              className="text-xs text-white/40 hover:text-white/70"
            >
              {i18n._(msg`notifications.markAllRead`)}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearMut.mutate(undefined)}
              className="text-xs text-white/40 hover:text-white/70"
            >
              {i18n._(msg`notifications.clearAll`)}
            </Button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-lg bg-white/[0.03] w-fit">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setFilter(tab.value);
                setLimit(PAGE_SIZE);
              }}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer',
                filter === tab.value
                  ? 'bg-white/[0.08] text-white font-medium'
                  : 'text-white/40 hover:text-white/60'
              )}
            >
              {i18n._(tab.msgKey)}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : notifications && notifications.length > 0 ? (
          <div className="space-y-6">
            {(['today', 'yesterday', 'earlier'] as const).map((group) => {
              const items = grouped[group];
              if (!items?.length) return null;
              return (
                <div key={group}>
                  <h2 className="text-xs font-medium text-white/30 uppercase tracking-wider mb-3">
                    {i18n._(TIME_GROUP_KEYS[group])}
                  </h2>
                  <div className="space-y-1.5">
                    <AnimatePresence>
                      {items.map((n) => (
                        <motion.div
                          key={n.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15 }}
                        >
                          <NotificationCard
                            notification={n}
                            onMarkRead={() => {
                              if (!n.read) markReadMut.mutate(n.id);
                            }}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}

            {/* Load more */}
            {notifications.length >= limit && (
              <div className="text-center pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
                  className="text-xs text-white/40 hover:text-white/70"
                >
                  {i18n._(msg`notifications.loadMore`)}
                </Button>
              </div>
            )}
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-white/[0.04] mb-4">
              <HugeiconsIcon
                icon={Notification03Icon}
                size={28}
                strokeWidth={1.5}
                className="text-white/20"
              />
            </div>
            <p className="text-sm text-white/40 mb-1">
              {i18n._(msg`notifications.empty`)}
            </p>
            <p className="text-xs text-white/25 max-w-xs">
              {i18n._(msg`notifications.emptyHint`)}
            </p>
          </div>
        )}
      </div>
    </PageTransition>
  );
}

/* ── Notification card ────────────────────────────────────── */

function NotificationCard({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: () => void;
}) {
  const { i18n } = useLingui();
  const severity = notification.severity ?? 'info';
  const typePrefix = notification.type?.split('.')[0] ?? 'system';
  const titleKey = notification.type ? NOTIFICATION_TITLE_KEYS[notification.type] : undefined;
  const displayTitle = titleKey ? i18n._(titleKey) : notification.title;

  return (
    <button
      type="button"
      onClick={onMarkRead}
      className={cn(
        'w-full text-left flex gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer hover:bg-white/[0.03]',
        !notification.read ? 'bg-white/[0.02]' : 'bg-transparent'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {!notification.read && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
          )}
          <span className="text-sm font-medium text-white">{displayTitle}</span>
          <span
            className={cn(
              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
              TYPE_BADGE[typePrefix] ?? 'bg-white/[0.06] text-white/40'
            )}
          >
            {TYPE_LABEL_KEYS[typePrefix]
              ? i18n._(TYPE_LABEL_KEYS[typePrefix])
              : typePrefix}
          </span>
        </div>
        <p className="text-xs text-white/40 mt-1 line-clamp-2">{notification.message}</p>
        <p className="text-[10px] text-white/25 mt-1.5">{timeAgo(notification.created_at, i18n)}</p>
      </div>
    </button>
  );
}

/* ── Group helper ─────────────────────────────────────────── */

function groupByTime(items: Notification[]) {
  const groups: Record<'today' | 'yesterday' | 'earlier', Notification[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  };
  for (const item of items) {
    groups[getTimeGroup(item.created_at)].push(item);
  }
  return groups;
}
