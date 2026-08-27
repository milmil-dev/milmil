import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '../../components/ui/button';
import { useDocumentTitle } from '../../hooks/use-document-title';

interface ProviderCard {
  key: 'bangumi' | 'anilist' | 'trakt';
  name: string;
  description: string;
}

export function IntegrationsStep() {
  const { i18n } = useLingui();
  useDocumentTitle(i18n._(msg`setup.integrations.title`));
  const navigate = useNavigate();

  const providers: ProviderCard[] = [
    {
      key: 'bangumi',
      name: 'Bangumi',
      description: i18n._(msg`setup.integrations.bangumiDescription`),
    },
    {
      key: 'anilist',
      name: 'AniList',
      description: i18n._(msg`setup.integrations.anilistDescription`),
    },
    {
      key: 'trakt',
      name: 'Trakt',
      description: i18n._(msg`setup.integrations.traktDescription`),
    },
  ];

  return (
    <>
      <h2 className="text-lg font-semibold text-ink mb-1">
        {i18n._(msg`setup.integrations.title`)}
      </h2>
      <p className="text-[13px] text-ink/40 mb-6">{i18n._(msg`setup.integrations.subtitle`)}</p>

      <ul className="space-y-3 mb-6">
        {providers.map((p) => (
          <li key={p.key} className="rounded-lg border border-ink/[0.06] bg-ink/[0.02] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-ink">{p.name}</p>
                <p className="mt-1 text-[12px] text-ink/40">{p.description}</p>
              </div>
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink/30">
                {i18n._(msg`setup.integrations.availableInSettings`)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <Button type="button" className="w-full" onClick={() => navigate({ to: '/' })}>
        {i18n._(msg`setup.integrations.finish`)}
      </Button>
    </>
  );
}
