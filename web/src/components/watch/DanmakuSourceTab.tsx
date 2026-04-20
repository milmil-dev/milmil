import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
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

  const { data: sources } = useQuery({
    queryKey: externalDanmakuKeys.sources(),
    queryFn: externalDanmakuApi.sources,
  });
  const [selectedSource, setSelectedSource] = useState('bilibili');

  const buildKeyword = () =>
    episodeNumber ? `${animeName} 第${episodeNumber}話` : animeName;
  const [keyword, setKeyword] = useState(buildKeyword);
  const [searchTriggered, setSearchTriggered] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);
  const [loadingPartsFor, setLoadingPartsFor] = useState<string | null>(null);
  const [videoParts, setVideoParts] = useState<VideoPart[]>([]);
  const [saveToLocal, setSaveToLocal] = useState(false);

  useEffect(() => {
    setKeyword(buildKeyword());
    setSearchTriggered(false);
    setSearchKeyword('');
    setExpandedVideoId(null);
    setVideoParts([]);
  }, [mediaFileId, animeName, episodeNumber]);

  const {
    data: searchResults,
    isLoading: searching,
    error: searchError,
  } = useQuery({
    queryKey: externalDanmakuKeys.search(selectedSource, searchKeyword, 1),
    queryFn: () => externalDanmakuApi.search(selectedSource, searchKeyword),
    enabled: searchTriggered && searchKeyword.length > 0,
  });

  const { data: imported } = useQuery({
    queryKey: externalDanmakuKeys.imported(mediaFileId ?? ''),
    queryFn: () => externalDanmakuApi.getImported(mediaFileId!),
    enabled: !!mediaFileId,
  });

  const importMutation = useMutation({
    mutationFn: ({ videoId, partIndex }: { videoId: string; partIndex: number }) =>
      externalDanmakuApi.import(selectedSource, videoId, mediaFileId!, partIndex, saveToLocal),
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

  const handleImportClick = async (result: DanmakuSearchResult) => {
    if (expandedVideoId === result.videoId) {
      setExpandedVideoId(null);
      setVideoParts([]);
      return;
    }

    setLoadingPartsFor(result.videoId);
    try {
      const parts = await externalDanmakuApi.parts(selectedSource, result.videoId);
      if (parts.length <= 1) {
        importMutation.mutate({ videoId: result.videoId, partIndex: 0 });
      } else {
        setExpandedVideoId(result.videoId);
        setVideoParts(parts);
      }
    } catch {
      importMutation.mutate({ videoId: result.videoId, partIndex: 0 });
    } finally {
      setLoadingPartsFor(null);
    }
  };

  const isExpanded = (id: string) => expandedVideoId === id;
  const isLoadingResult = (id: string) =>
    loadingPartsFor === id ||
    (importMutation.isPending && importMutation.variables?.videoId === id && expandedVideoId !== id);

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
              <option key={s.name} value={s.name}>{s.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
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

      {/* Save toggle */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={saveToLocal}
          onChange={(e) => setSaveToLocal(e.target.checked)}
          className="w-3.5 h-3.5 rounded border-white/20 bg-white/[0.04] accent-blue-500"
        />
        <span className="text-[11px] text-white/40">
          {i18n._(msg`watch.danmaku.saveLocal`)}
        </span>
      </label>

      {/* Results */}
      {searchTriggered && (
        <div className="flex flex-col gap-0.5">
          {searching && (
            <div className="flex items-center justify-center py-8">
              <Spinner size={20} className="text-white/30" />
            </div>
          )}

          {searchError && (
            <div className="text-xs text-red-400/70 py-3 text-center">
              {i18n._(msg`watch.danmaku.searchError`)}
            </div>
          )}

          {searchResults && searchResults.length === 0 && (
            <div className="text-xs text-white/30 py-6 text-center">
              {i18n._(msg`watch.danmaku.noResults`)}
            </div>
          )}

          {searchResults?.map((result, idx) => (
            <motion.div
              key={result.videoId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: idx * 0.03 }}
              className={cn(
                'rounded-lg transition-colors',
                isExpanded(result.videoId)
                  ? 'bg-white/[0.03] ring-1 ring-white/[0.06]'
                  : 'hover:bg-white/[0.03]'
              )}
            >
              {/* Result row */}
              <button
                type="button"
                onClick={() => handleImportClick(result)}
                disabled={isLoadingResult(result.videoId)}
                className="w-full flex items-start gap-2.5 p-2.5 text-left"
              >
                {result.thumbnail && (
                  <img
                    src={result.thumbnail}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-16 h-10 rounded object-cover shrink-0 bg-white/[0.04]"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-white/80 leading-snug line-clamp-2">
                    {result.title}
                  </p>
                  <p className="text-[11px] text-white/30 mt-1 flex items-center gap-1.5">
                    <span>{formatCount(result.danmakuCount)} 弹幕</span>
                    <span className="text-white/15">·</span>
                    <span>{result.duration}</span>
                  </p>
                </div>
                <div className="shrink-0 pt-0.5">
                  {isLoadingResult(result.videoId) ? (
                    <Spinner size={14} className="text-blue-400/50" />
                  ) : (
                    <span
                      className={cn(
                        'text-xs py-1 px-2 rounded transition-all',
                        isExpanded(result.videoId)
                          ? 'text-white/40 bg-white/[0.04]'
                          : 'text-blue-400/70 hover:text-blue-400 hover:bg-blue-400/[0.08]'
                      )}
                    >
                      {isExpanded(result.videoId)
                        ? i18n._(msg`watch.danmaku.closeParts`)
                        : i18n._(msg`watch.danmaku.import`)}
                    </span>
                  )}
                </div>
              </button>

              {/* Part picker */}
              <AnimatePresence>
                {isExpanded(result.videoId) && videoParts.length > 1 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="mx-2.5 mb-2.5 rounded-md bg-white/[0.02] border border-white/[0.05]">
                      <div className="px-2.5 pt-2 pb-1.5 flex items-center justify-between">
                        <span className="text-[11px] text-white/30">
                          {i18n._(msg`watch.danmaku.selectPart`)}
                        </span>
                        <span className="text-[10px] text-white/20 tabular-nums">
                          {videoParts.length}P
                        </span>
                      </div>
                      <div className="max-h-[240px] overflow-y-auto pb-1">
                        {videoParts.map((part) => (
                          <button
                            key={part.index}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              importMutation.mutate({
                                videoId: result.videoId,
                                partIndex: part.index,
                              });
                            }}
                            disabled={importMutation.isPending}
                            className={cn(
                              'w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors',
                              'hover:bg-white/[0.05] disabled:opacity-40',
                              importMutation.isPending &&
                                importMutation.variables?.partIndex === part.index &&
                                importMutation.variables?.videoId === result.videoId &&
                                'bg-blue-500/[0.06]'
                            )}
                          >
                            <span className="w-7 text-center text-[11px] font-medium text-white/25 tabular-nums shrink-0">
                              P{part.index + 1}
                            </span>
                            <span className="flex-1 text-xs text-white/60 truncate">
                              {part.title || `Part ${part.index + 1}`}
                            </span>
                            {part.duration > 0 && (
                              <span className="text-[11px] text-white/20 tabular-nums shrink-0">
                                {formatDuration(part.duration)}
                              </span>
                            )}
                            {importMutation.isPending &&
                              importMutation.variables?.partIndex === part.index &&
                              importMutation.variables?.videoId === result.videoId && (
                                <Spinner size={12} className="text-blue-400/50 shrink-0" />
                              )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}

      {/* Imported */}
      <AnimatePresence>
        {imported && imported.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/[0.06] pt-2.5 mt-1"
          >
            <p className="text-[11px] text-white/25 mb-2 font-medium tracking-wider uppercase">
              {i18n._(msg`watch.danmaku.imported`)}
            </p>
            {imported.map((item) => (
              <div
                key={item.source}
                className="flex items-center justify-between py-2 group"
              >
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    item.saved ? 'bg-blue-400/60' : 'bg-green-500/50'
                  )} />
                  <span className="text-xs text-white/50">
                    {item.source}
                  </span>
                  <span className="text-[11px] text-white/25">
                    {formatCount(item.count)} 弹幕
                  </span>
                  <span className={cn(
                    'text-[10px] px-1 py-0.5 rounded',
                    item.saved
                      ? 'bg-blue-500/10 text-blue-400/50'
                      : 'bg-white/[0.04] text-white/20'
                  )}>
                    {item.saved ? i18n._(msg`watch.danmaku.saved`) : i18n._(msg`watch.danmaku.cached`)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeMutation.mutate(item.source)}
                  disabled={removeMutation.isPending}
                  className="text-[11px] text-white/20 hover:text-red-400/70 py-1 px-1.5 rounded opacity-0 group-hover:opacity-100 transition-all"
                >
                  {i18n._(msg`watch.danmaku.remove`)}
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
