import {
  ComputerIcon,
  Delete02Icon,
  Logout02Icon,
  SmartPhone01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';

interface SessionDTO {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  last_ip: string;
  last_user_agent: string;
  created_at: string;
  is_current: boolean;
}

export function SessionsTab() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const { data: sessions = [] } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: () => api.get<SessionDTO[]>('/api/v1/api-tokens'),
  });

  const revokeSession = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/api-tokens/${id}`),
    onSuccess: () => {
      toast.success(i18n._(msg`sessions.revoked`));
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
    onError: () => toast.error(i18n._(msg`sessions.revokeFailed`)),
  });

  const revokeOthers = useMutation({
    mutationFn: () => api.delete('/api/v1/api-tokens/others'),
    onSuccess: () => {
      toast.success(i18n._(msg`sessions.allOthersRevoked`));
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
    onError: () => toast.error(i18n._(msg`sessions.revokeFailed`)),
  });

  const formatRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return i18n._(msg`sessions.justNow`);
    if (minutes < 60) return i18n._(msg`sessions.minutesAgo`, { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return i18n._(msg`sessions.hoursAgo`, { count: hours });
    const days = Math.floor(hours / 24);
    return i18n._(msg`sessions.daysAgo`, { count: days });
  };

  const isMobile = (ua: string) => /iPhone|iPad|Android|milmil-ios|milmil-android/i.test(ua);

  const otherSessions = sessions.filter((s) => !s.is_current);

  return (
    <div className="space-y-3">
      <SettingsCard label={i18n._(msg`sessions.title`)}>
        <p className="mb-4 text-xs text-white/40">{i18n._(msg`sessions.description`)}</p>

        <div className="space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <HugeiconsIcon
                  icon={isMobile(session.last_user_agent) ? SmartPhone01Icon : ComputerIcon}
                  size={18}
                  className={`shrink-0 ${session.is_current ? 'text-mm-accent' : 'text-white/25'}`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-white truncate">{session.name}</p>
                    {session.is_current && (
                      <span className="shrink-0 rounded-full bg-mm-accent/15 px-2 py-0.5 text-[10px] font-medium text-mm-accent">
                        {i18n._(msg`sessions.current`)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/25">
                    {session.last_ip && <span>{session.last_ip}</span>}
                    {session.last_used_at && (
                      <span className="ml-2">· {formatRelativeTime(session.last_used_at)}</span>
                    )}
                  </p>
                </div>
              </div>
              {!session.is_current && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(i18n._(msg`sessions.revokeConfirm`))) {
                      revokeSession.mutate(session.id);
                    }
                  }}
                  disabled={revokeSession.isPending}
                  className="shrink-0 rounded-md p-1.5 text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  title={i18n._(msg`sessions.revoke`)}
                >
                  <HugeiconsIcon icon={Delete02Icon} size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {otherSessions.length > 0 && (
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-400/70 hover:text-red-400 hover:bg-red-400/10"
              onClick={() => {
                if (confirm(i18n._(msg`sessions.revokeAllConfirm`))) {
                  revokeOthers.mutate();
                }
              }}
              disabled={revokeOthers.isPending}
            >
              <HugeiconsIcon icon={Logout02Icon} size={14} className="mr-1.5" />
              {i18n._(msg`sessions.revokeAllOthers`)}
            </Button>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
