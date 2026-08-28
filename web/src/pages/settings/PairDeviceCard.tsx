import { ComputerIcon, QrCode01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';

interface ApiTokenCreateResponse {
  id: string;
  name: string;
  token: string;
  token_prefix: string;
  created_at: string;
}

/** The address a client should dial. Behind a reverse proxy this is already
 *  the public URL, prefix included — the same thing you typed to get here. */
function serverURL(): string {
  return window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '');
}

/** `milmil://pair?…` — the native clients register this scheme. */
function pairLink(token: string, name: string): string {
  const params = new URLSearchParams({ url: serverURL(), token, name });
  return `milmil://pair?${params.toString()}`;
}

/**
 * Hands a device everything it needs in one scan: the server address and a
 * token, so the macOS app lands signed in instead of asking for a URL and a
 * password. The token is a normal API token — revoke it from the list below.
 */
export function PairDeviceCard() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [link, setLink] = useState<string | null>(null);

  const pair = useMutation({
    mutationFn: () => {
      const date = new Date().toLocaleDateString(i18n.locale);
      const label = i18n._(msg`pair.tokenName ${date}`);
      return api.post<ApiTokenCreateResponse>('/api/v1/api-tokens', { name: label });
    },
    onSuccess: (data) => {
      setLink(pairLink(data.token, document.title || 'milmil'));
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
    onError: () => toast.error(i18n._(msg`pair.failed`)),
  });

  const copyLink = () => {
    if (!link) return;
    navigator.clipboard.writeText(link);
    toast.success(i18n._(msg`common.copied`));
  };

  return (
    <SettingsCard label={i18n._(msg`pair.title`)}>
      <p className="mb-4 text-xs text-ink/40">{i18n._(msg`pair.description`)}</p>

      {!link && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid="pair-start"
          onClick={() => pair.mutate()}
          disabled={pair.isPending}
        >
          <HugeiconsIcon icon={QrCode01Icon} size={14} />
          {i18n._(msg`pair.start`)}
        </Button>
      )}

      {link && (
        <div className="rounded-lg border border-mm-accent/20 bg-mm-accent/[0.04] p-3">
          <p className="mb-3 text-xs font-medium text-mm-accent">{i18n._(msg`pair.warning`)}</p>

          <div className="flex justify-center">
            <div className="rounded-lg bg-white p-2.5">
              <QRCodeSVG value={link} size={160} data-testid="pair-qr" data-link={link} />
            </div>
          </div>

          <p className="mt-3 text-center text-[11px] text-ink/40">{i18n._(msg`pair.scanHint`)}</p>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {/* Same machine: the scheme handler configures the app directly. */}
            <Button type="button" variant="secondary" size="sm" asChild>
              <a href={link} data-testid="pair-open-in-app">
                <HugeiconsIcon icon={ComputerIcon} size={14} />
                {i18n._(msg`pair.openInApp`)}
              </a>
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={copyLink}>
              {i18n._(msg`pair.copyLink`)}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => pair.mutate()}
              disabled={pair.isPending}
            >
              <HugeiconsIcon icon={RefreshIcon} size={14} />
              {i18n._(msg`pair.again`)}
            </Button>
          </div>

          <button
            type="button"
            className="mt-3 text-[11px] text-ink/30 hover:text-ink/50 transition-colors"
            onClick={() => setLink(null)}
          >
            {i18n._(msg`pair.done`)}
          </button>
        </div>
      )}
    </SettingsCard>
  );
}
