import { Notification03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import {
  type Notification,
  notificationApi,
  notificationKeys,
} from '../lib/api/notifications';
import { cn } from '../lib/utils';

/* ── Relative time helper ─────────────────────────────────── */

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

/* ── Severity color ───────────────────────────────────────── */

const SEVERITY_BORDER: Record<string, string> = {
  success: 'border-l-green-400',
  info: 'border-l-blue-400',
  error: 'border-l-red-400',
};

/* ── Component ────────────────────────────────────────────── */

export function NotificationBell() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Unread count — poll every 30s
  const { data: unreadData } = useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: notificationApi.unreadCount,
    refetchInterval: 30_000,
  });
  const unreadCount = unreadData?.count ?? 0;

  // Latest notifications — only fetch when dropdown is open
  const { data: notifications, isLoading } = useQuery({
    queryKey: [...notificationKeys.list(), 'bell'],
    queryFn: () => notificationApi.list({ limit: 5 }),
    enabled: open,
  });

  // Mark single read
  const markReadMut = useMutation({
    mutationFn: notificationApi.markRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Mark all read
  const markAllMut = useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center w-9 h-9 rounded-full text-white/40 hover:text-white/80 hover:bg-white/[0.04] transition-colors cursor-pointer"
        aria-label={i18n._(msg`nav.notifications`)}
      >
        <HugeiconsIcon icon={Notification03Icon} size={18} strokeWidth={1.5} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute left-[calc(100%+8px)] bottom-0 w-80 rounded-lg border border-white/[0.08] bg-[#111] shadow-xl shadow-black/50 overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
              <span className="text-sm font-medium text-white">
                {i18n._(msg`notifications.title`)}
              </span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllMut.mutate(undefined)}
                  className="text-[11px] text-white/40 hover:text-white/70 transition-colors cursor-pointer"
                >
                  {i18n._(msg`notifications.markAllRead`)}
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto">
              {isLoading ? (
                <div className="space-y-1 p-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-16 rounded-md animate-pulse bg-white/[0.04]" />
                  ))}
                </div>
              ) : notifications && notifications.length > 0 ? (
                notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onMarkRead={() => {
                      if (!n.read) markReadMut.mutate(n.id);
                    }}
                  />
                ))
              ) : (
                <div className="px-3 py-8 text-center text-sm text-white/30">
                  {i18n._(msg`notifications.empty`)}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-white/[0.06]">
              <Link
                to="/notifications"
                onClick={() => setOpen(false)}
                className="block px-3 py-2.5 text-center text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.02] transition-colors"
              >
                {i18n._(msg`notifications.viewAll`)} &rarr;
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Single notification item ─────────────────────────────── */

function NotificationItem({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: () => void;
}) {
  const { i18n } = useLingui();
  const severity = notification.severity ?? 'info';

  return (
    <button
      type="button"
      onClick={onMarkRead}
      className={cn(
        'w-full text-left flex gap-2.5 px-3 py-2.5 transition-colors cursor-pointer hover:bg-white/[0.03]',
        !notification.read && 'bg-white/[0.02]'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {!notification.read && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
          )}
          <span className="text-sm font-medium text-white truncate">
            {notification.title}
          </span>
        </div>
        <p className="text-xs text-white/40 mt-0.5 line-clamp-2">{notification.message}</p>
        <p className="text-[10px] text-white/25 mt-1">{timeAgo(notification.created_at, i18n)}</p>
      </div>
    </button>
  );
}
