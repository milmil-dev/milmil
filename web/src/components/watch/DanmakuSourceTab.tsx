import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import {
  type DanmakuSearchResult,
  externalDanmakuApi,
  externalDanmakuKeys,
} from '@/lib/api/danmaku';

interface DanmakuSourceTabProps {
  mediaFileId: string | null;
  animeName: string;
  episodeNumber: number | undefined;
  onImported: () => void;
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function DanmakuSourceTab({
  mediaFileId,
  animeName,
  episodeNumber,
  onImported,
}: DanmakuSourceTabProps) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  // Source selection
  const { data: sources } = useQuery({
    queryKey: externalDanmakuKeys.sources(),
    queryFn: externalDanmakuApi.sources,
  });
  const [selectedSource, setSelectedSource] = useState('bilibili');

  // Search state
  const buildKeyword = () =>
    episodeNumber ? `${animeName} 第${episodeNumber}話` : animeName;
  const [keyword, setKeyword] = useState(buildKeyword);
  const [searchTriggered, setSearchTriggered] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  // Reset state when episode changes
  useEffect(() => {
    setKeyword(buildKeyword());
    setSearchTriggered(false);
    setSearchKeyword('');
  }, [mediaFileId, animeName, episodeNumber]);

  // Search query
  const {
    data: searchResults,
    isLoading: searching,
    error: searchError,
  } = useQuery({
    queryKey: externalDanmakuKeys.search(selectedSource, searchKeyword, 1),
    queryFn: () => externalDanmakuApi.search(selectedSource, searchKeyword),
    enabled: searchTriggered && searchKeyword.length > 0,
  });

  // Imported danmaku query
  const { data: imported } = useQuery({
    queryKey: externalDanmakuKeys.imported(mediaFileId ?? ''),
    queryFn: () => externalDanmakuApi.getImported(mediaFileId!),
    enabled: !!mediaFileId,
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (result: DanmakuSearchResult) =>
      externalDanmakuApi.import(selectedSource, result.videoId, mediaFileId!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: externalDanmakuKeys.imported(mediaFileId ?? ''),
      });
      onImported();
      toast.success(`Imported ${formatCount(data.count)} danmaku from ${selectedSource}`);
    },
    onError: () => {
      toast.error(i18n._(msg`watch.danmaku.importError`));
    },
  });

  // Remove mutation
  const removeMutation = useMutation({
    mutationFn: (source: string) =>
      externalDanmakuApi.removeImported(mediaFileId!, source),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: externalDanmakuKeys.imported(mediaFileId ?? ''),
      });
      onImported();
    },
  });

  const handleSearch = () => {
    if (!keyword.trim()) return;
    setSearchKeyword(keyword.trim());
    setSearchTriggered(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Source selector */}
      {sources && sources.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40 shrink-0">
            {i18n._(msg`watch.danmaku.source`)}
          </span>
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-xs text-white outline-none"
          >
            {sources.map((s) => (
              <option key={s.name} value={s.name}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Search input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={i18n._(msg`watch.danmaku.searchPlaceholder`)}
          className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded px-2.5 py-1.5 text-xs text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-colors"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={!keyword.trim() || searching}
          className="shrink-0 bg-white/[0.08] text-white/70 text-xs px-3 py-1.5 rounded transition-colors hover:bg-white/[0.12] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {searching ? <Spinner size={12} /> : i18n._(msg`watch.danmaku.search`)}
        </button>
      </div>

      {/* Search results */}
      {searchTriggered && (
        <div className="flex flex-col gap-1">
          {searching && (
            <div className="flex items-center justify-center py-6">
              <Spinner size={20} className="text-white/30" />
            </div>
          )}

          {searchError && (
            <div className="text-xs text-red-400/70 py-2">
              {i18n._(msg`watch.danmaku.searchError`)}
            </div>
          )}

          {searchResults && searchResults.length === 0 && (
            <div className="text-xs text-white/30 py-4 text-center">
              {i18n._(msg`watch.danmaku.noResults`)}
            </div>
          )}

          {searchResults?.map((result) => (
            <div
              key={result.videoId}
              className="flex items-start gap-2.5 p-2 rounded hover:bg-white/[0.04] transition-colors"
            >
              {result.thumbnail && (
                <img
                  src={result.thumbnail}
                  alt=""
                  className="w-[54px] h-[40px] rounded object-cover shrink-0 bg-white/[0.04]"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/70 line-clamp-2" title={result.title}>
                  {result.title}
                </p>
                <p className="text-[11px] text-white/30 mt-0.5">
                  {formatCount(result.danmakuCount)} danmaku · {result.duration}
                </p>
              </div>
              <button
                type="button"
                onClick={() => importMutation.mutate(result)}
                disabled={importMutation.isPending}
                className="shrink-0 text-xs text-blue-400/70 hover:text-blue-400 py-2 px-2 rounded transition-colors disabled:opacity-40"
              >
                {importMutation.isPending &&
                importMutation.variables?.videoId === result.videoId
                  ? i18n._(msg`watch.danmaku.importing`)
                  : i18n._(msg`watch.danmaku.import`)}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Imported danmaku */}
      {imported && imported.length > 0 && (
        <div className="border-t border-white/[0.06] pt-2 mt-1">
          <p className="text-[11px] text-white/30 mb-1.5 uppercase tracking-wider">
            {i18n._(msg`watch.danmaku.imported`)}
          </p>
          {imported.map((item) => (
            <div
              key={item.source}
              className="flex items-center justify-between py-1.5"
            >
              <span className="text-xs text-white/50">
                {item.source} · {formatCount(item.count)} danmaku
              </span>
              <button
                type="button"
                onClick={() => removeMutation.mutate(item.source)}
                disabled={removeMutation.isPending}
                className="text-xs text-red-400/50 hover:text-red-400 py-2 px-2 rounded transition-colors"
              >
                {i18n._(msg`watch.danmaku.remove`)}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
