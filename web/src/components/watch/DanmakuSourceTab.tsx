import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import {
  type DanmakuSearchResult,
  type VideoPart,
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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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

  // Multi-part expansion state
  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);
  const [loadingParts, setLoadingParts] = useState(false);
  const [videoParts, setVideoParts] = useState<VideoPart[]>([]);

  // Reset state when episode changes
  useEffect(() => {
    setKeyword(buildKeyword());
    setSearchTriggered(false);
    setSearchKeyword('');
    setExpandedVideoId(null);
    setVideoParts([]);
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
    mutationFn: ({ videoId, partIndex }: { videoId: string; partIndex: number }) =>
      externalDanmakuApi.import(selectedSource, videoId, mediaFileId!, partIndex),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: externalDanmakuKeys.imported(mediaFileId ?? ''),
      });
      onImported();
      toast.success(`Imported ${formatCount(data.count)} danmaku from ${selectedSource}`);
      setExpandedVideoId(null);
      setVideoParts([]);
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
    setExpandedVideoId(null);
    setVideoParts([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleImportClick = async (result: DanmakuSearchResult) => {
    // Fetch parts to check if multi-page
    setLoadingParts(true);
    try {
      const parts = await externalDanmakuApi.parts(selectedSource, result.videoId);
      if (parts.length <= 1) {
        // Single part — import directly
        importMutation.mutate({ videoId: result.videoId, partIndex: 0 });
      } else {
        // Multi-part — expand to show part picker
        setExpandedVideoId(result.videoId);
        setVideoParts(parts);
      }
    } catch {
      // If parts fetch fails, try importing part 0
      importMutation.mutate({ videoId: result.videoId, partIndex: 0 });
    } finally {
      setLoadingParts(false);
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
            <div key={result.videoId}>
              <div className="flex items-start gap-2.5 p-2 rounded hover:bg-white/[0.04] transition-colors">
                {result.thumbnail && (
                  <img
                    src={result.thumbnail}
                    alt=""
                    referrerPolicy="no-referrer"
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
                  onClick={() => handleImportClick(result)}
                  disabled={importMutation.isPending || loadingParts}
                  className="shrink-0 text-xs text-blue-400/70 hover:text-blue-400 py-2 px-2 rounded transition-colors disabled:opacity-40"
                >
                  {(importMutation.isPending &&
                    importMutation.variables?.videoId === result.videoId) ||
                  (loadingParts && expandedVideoId === null)
                    ? i18n._(msg`watch.danmaku.importing`)
                    : expandedVideoId === result.videoId
                      ? i18n._(msg`watch.danmaku.closeParts`)
                      : i18n._(msg`watch.danmaku.import`)}
                </button>
              </div>

              {/* Inline part picker for multi-page videos */}
              {expandedVideoId === result.videoId && videoParts.length > 1 && (
                <div className="ml-[66px] mr-2 mb-1 border border-white/[0.06] rounded bg-white/[0.02]">
                  <p className="text-[11px] text-white/30 px-2 pt-1.5 pb-1">
                    {i18n._(msg`watch.danmaku.selectPart`)} ({videoParts.length}P)
                  </p>
                  <div className="max-h-[200px] overflow-y-auto">
                    {videoParts.map((part) => (
                      <button
                        key={part.index}
                        type="button"
                        onClick={() =>
                          importMutation.mutate({
                            videoId: result.videoId,
                            partIndex: part.index,
                          })
                        }
                        disabled={importMutation.isPending}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-left hover:bg-white/[0.04] transition-colors disabled:opacity-40"
                      >
                        <span className="text-xs text-white/60 truncate">
                          P{part.index + 1}
                          {part.title ? ` · ${part.title}` : ''}
                        </span>
                        {part.duration > 0 && (
                          <span className="text-[11px] text-white/25 shrink-0 ml-2">
                            {formatDuration(part.duration)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
