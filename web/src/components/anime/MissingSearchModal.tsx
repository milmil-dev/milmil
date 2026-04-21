import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { type MissingSearchResult, missingSearchApi } from '@/lib/api/missing_search';

interface Props {
  bangumiId: number;
  episodeNumber: number;
  onClose: () => void;
}

export function MissingSearchModal({ bangumiId, episodeNumber, onClose }: Props) {
  const { i18n } = useLingui();

  const search = useMutation({
    mutationFn: () => missingSearchApi.search(bangumiId, episodeNumber),
  });

  const download = useMutation({
    mutationFn: (r: MissingSearchResult) => {
      const uri = r.magnet ?? r.torrent_url ?? '';
      return missingSearchApi.download(bangumiId, uri, r.title);
    },
    onSuccess: (res) => {
      toast.success(i18n._(msg`Download queued: ${res.download_id.slice(0, 8)}`));
      onClose();
    },
    onError: (err: unknown) => toast.error(String(err)),
  });

  useEffect(() => {
    search.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = search.data?.results ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-[min(1000px,90vw)] overflow-auto rounded-lg border border-white/10 bg-black/80 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/80">
            {i18n._(msg`Search missing episode ${episodeNumber}`)}
          </h3>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white">
            ✕
          </button>
        </div>

        {search.isPending && (
          <div className="py-8 text-center text-sm text-white/60">{i18n._(msg`Searching...`)}</div>
        )}
        {!search.isPending && results.length === 0 && (
          <div className="py-8 text-center text-sm text-white/60">
            {i18n._(msg`No results from any provider.`)}
          </div>
        )}
        {results.length > 0 && (
          <table className="w-full text-xs">
            <thead className="text-white/50">
              <tr>
                <th className="py-1 text-left">{i18n._(msg`Title`)}</th>
                <th className="py-1 text-right">{i18n._(msg`Size`)}</th>
                <th className="py-1 text-right">{i18n._(msg`Seeders`)}</th>
                <th className="py-1 text-left">{i18n._(msg`Subgroup`)}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.info_hash || r.title + i} className="border-t border-white/10 align-top">
                  <td className="py-1 pr-2 text-white/80">{r.title}</td>
                  <td className="py-1 pr-2 text-right text-white/60">{r.size_display}</td>
                  <td className="py-1 pr-2 text-right text-white/60">{r.seeders}</td>
                  <td className="py-1 pr-2 text-white/60">{r.parsed.SubGroup}</td>
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      disabled={download.isPending}
                      onClick={() => download.mutate(r)}
                      className="rounded bg-white/10 px-2 py-0.5 text-white hover:bg-white/20 disabled:opacity-50"
                    >
                      {i18n._(msg`Download`)}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
