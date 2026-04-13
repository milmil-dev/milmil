import { useState } from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon, SmartPhone01Icon, Add01Icon, Copy01Icon } from '@hugeicons/core-free-icons';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';

interface ApiTokenDTO {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

interface ApiTokenCreateResponse {
  id: string;
  name: string;
  token: string;
  token_prefix: string;
  created_at: string;
}

const inputClass = 'bg-transparent border-white/[0.08] focus:border-mm-accent text-white';

export function ApiTokensCard() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [newTokenName, setNewTokenName] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const { data: tokens = [] } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: () => api.get<ApiTokenDTO[]>('/api/v1/api-tokens'),
  });

  const createToken = useMutation({
    mutationFn: (name: string) =>
      api.post<ApiTokenCreateResponse>('/api/v1/api-tokens', { name }),
    onSuccess: (data) => {
      setCreatedToken(data.token);
      setNewTokenName('');
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
    onError: () => toast.error(i18n._(msg`apiTokens.createFailed`)),
  });

  const deleteToken = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/api-tokens/${id}`),
    onSuccess: () => {
      toast.success(i18n._(msg`apiTokens.revoked`));
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
    onError: () => toast.error(i18n._(msg`apiTokens.revokeFailed`)),
  });

  const copyToken = () => {
    if (createdToken) {
      navigator.clipboard.writeText(createdToken);
      toast.success(i18n._(msg`common.copied`));
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <SettingsCard label={i18n._(msg`apiTokens.title`)}>
      <p className="mb-4 text-xs text-white/40">
        {i18n._(msg`apiTokens.description`)}
      </p>

      {/* Created token banner — shown once after creation */}
      {createdToken && (
        <div className="mb-4 rounded-lg border border-mm-accent/20 bg-mm-accent/[0.04] p-3">
          <p className="mb-2 text-xs font-medium text-mm-accent">
            {i18n._(msg`apiTokens.createdWarning`)}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-black/30 px-2 py-1.5 text-xs font-mono text-white/80">
              {createdToken}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={copyToken}
              className="shrink-0"
            >
              <HugeiconsIcon icon={Copy01Icon} size={14} />
            </Button>
          </div>
          <button
            type="button"
            className="mt-2 text-[11px] text-white/30 hover:text-white/50 transition-colors"
            onClick={() => setCreatedToken(null)}
          >
            {i18n._(msg`apiTokens.dismiss`)}
          </button>
        </div>
      )}

      {/* Token list */}
      {tokens.length > 0 && (
        <div className="mb-4 space-y-2">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <HugeiconsIcon
                  icon={SmartPhone01Icon}
                  size={15}
                  className="shrink-0 text-white/30"
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-white truncate">
                    {token.name}
                  </p>
                  <p className="text-[11px] text-white/25 font-mono">
                    mlml_{token.token_prefix}...
                    {token.last_used_at && (
                      <span className="ml-2 font-sans">
                        · {i18n._(msg`apiTokens.lastUsed`)} {formatDate(token.last_used_at)}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => deleteToken.mutate(token.id)}
                disabled={deleteToken.isPending}
                className="shrink-0 rounded-md p-1.5 text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                title={i18n._(msg`apiTokens.revoke`)}
              >
                <HugeiconsIcon icon={Delete02Icon} size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create new token */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder={i18n._(msg`apiTokens.namePlaceholder`)}
          value={newTokenName}
          onChange={(e) => setNewTokenName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newTokenName.trim()) {
              createToken.mutate(newTokenName.trim());
            }
          }}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm ${inputClass}`}
        />
        <Button
          type="button"
          size="sm"
          disabled={!newTokenName.trim() || createToken.isPending}
          onClick={() => createToken.mutate(newTokenName.trim())}
        >
          <HugeiconsIcon icon={Add01Icon} size={14} className="mr-1" />
          {i18n._(msg`apiTokens.create`)}
        </Button>
      </div>
    </SettingsCard>
  );
}
