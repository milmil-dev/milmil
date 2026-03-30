import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearch } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VideoPlayerAPI } from '@/components/VideoPlayer';
import { DanmakuOverlay } from '@/components/DanmakuOverlay';
import { DanmakuSettings } from '@/components/DanmakuSettings';
import { PageTransition } from '@/components/PageTransition';
import { Skeleton } from '@/components/Skeleton';
import { VideoPlayer } from '@/components/VideoPlayer';
import { progressApi, progressKeys } from '@/lib/api/progress';
import {
  type DanmakuComment,
  getHLSUrl,
  getMimeType,
  getStreamUrl,
  type MediaInfo,
  mediaApi,
  mediaKeys,
  parseDandanplayComments,
  streamApi,
} from '@/lib/api/stream';
import { getSubtitleUrl, subtitleApi } from '@/lib/api/subtitle';
import { cn } from '@/lib/utils';
import { usePlayerStore } from '@/store/player-store';

const SAVE_INTERVAL_MS = 10_000;
const COMPLETION_THRESHOLD_SECONDS = 30;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type TranscodeStatus = 'idle' | 'starting' | 'transcoding' | 'ready' | 'error';

export function WatchPage() {
  const { i18n } = useLingui();
  const { fileId } = useParams({ strict: false });
  const { episodeId } = useSearch({ strict: false }) as { episodeId?: string };
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const danmakuOpacity = usePlayerStore((s) => s.danmakuOpacity);
  const danmakuFontSize = usePlayerStore((s) => s.danmakuFontSize);
  const queryClient = useQueryClient();

  const playerRef = useRef<VideoPlayerAPI | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Transcode state
  const [transcodeToken, setTranscodeToken] = useState<string | null>(null);
  const [transcodeStatus, setTranscodeStatus] = useState<TranscodeStatus>('idle');

  // Media info query
  const { data: mediaInfo } = useQuery({
    queryKey: mediaKeys.info(fileId ?? ''),
    queryFn: () => mediaApi.info(fileId!),
    enabled: !!fileId,
  });

  const { data: danmakuData } = useQuery({
    queryKey: ['danmaku', fileId],
    queryFn: async () => {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL ?? 'http://localhost:8080'}/api/v1/danmaku/${fileId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('milmil-token') ?? ''}`,
          },
        }
      );
      if (!res.ok) return null;
      return res.json() as Promise<{
        count: number;
        comments: { p: string; m: string }[];
      }>;
    },
    enabled: !!fileId,
  });

  const { data: subtitles } = useQuery({
    queryKey: ['subtitles', fileId],
    queryFn: () => subtitleApi.list(fileId!),
    enabled: !!fileId,
  });

  const { data: savedProgress } = useQuery({
    queryKey: progressKeys.byFile(fileId ?? ''),
    queryFn: () => progressApi.byFile(fileId!),
    enabled: !!fileId,
    retry: false,
  });

  // Auto-trigger transcode when needed
  useEffect(() => {
    if (!mediaInfo || !fileId) return;
    if (mediaInfo.needs_transcode && mediaInfo.library_online && transcodeStatus === 'idle') {
      setTranscodeStatus('starting');
      streamApi
        .transcode(fileId, { codec: 'h264', resolution: '1080p' })
        .then(({ token }) => {
          setTranscodeToken(token);
          setTranscodeStatus('transcoding');
        })
        .catch(() => setTranscodeStatus('error'));
    }
  }, [mediaInfo, fileId, transcodeStatus]);

  // Listen for WebSocket transcode events
  useEffect(() => {
    function onWS(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === 'transcode:ready' && detail?.data?.token === transcodeToken) {
        setTranscodeStatus('ready');
      }
      if (detail?.type === 'transcode:error' && detail?.data?.token === transcodeToken) {
        setTranscodeStatus('error');
      }
    }
    window.addEventListener('milmil-ws', onWS);
    return () => window.removeEventListener('milmil-ws', onWS);
  }, [transcodeToken]);

  // Compute stream URL dynamically
  const streamUrl = useMemo(() => {
    if (!fileId) return '';
    if (transcodeStatus === 'ready' && transcodeToken) return getHLSUrl(transcodeToken);
    if (mediaInfo?.can_direct_play) return getStreamUrl(fileId);
    return '';
  }, [fileId, mediaInfo, transcodeStatus, transcodeToken]);

  const mimeType = useMemo(() => {
    if (transcodeStatus === 'ready') return 'application/x-mpegURL';
    return getMimeType(mediaInfo?.filename ?? 'video.mp4');
  }, [transcodeStatus, mediaInfo]);

  const comments: DanmakuComment[] = danmakuData?.comments
    ? parseDandanplayComments(danmakuData.comments, danmakuFontSize, danmakuOpacity)
    : [];

  const resolvedEpisodeId = episodeId ?? savedProgress?.episode_id;

  const saveProgress = useCallback(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed() || !fileId || !resolvedEpisodeId) return;

    const position = Math.floor(player.currentTime?.() ?? 0);
    const duration = Math.floor(player.duration?.() ?? 0);
    if (position <= 0) return;

    const completed = duration > 0 && position >= duration - COMPLETION_THRESHOLD_SECONDS;

    progressApi
      .save({
        media_file_id: fileId,
        episode_id: resolvedEpisodeId,
        position_seconds: position,
        duration_seconds: duration,
        completed,
      })
      .catch(() => {});
  }, [fileId, resolvedEpisodeId]);

  const startSaveInterval = useCallback(() => {
    if (saveIntervalRef.current) return;
    saveIntervalRef.current = setInterval(saveProgress, SAVE_INTERVAL_MS);
  }, [saveProgress]);

  const stopSaveInterval = useCallback(() => {
    if (saveIntervalRef.current) {
      clearInterval(saveIntervalRef.current);
      saveIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopSaveInterval();
      saveProgress();
    };
  }, [stopSaveInterval, saveProgress]);

  const handlePlayerReady = (api: VideoPlayerAPI) => {
    setVideoEl(api.videoElement());
    playerRef.current = api;

    if (savedProgress && savedProgress.position_seconds > 0 && !savedProgress.completed) {
      api.currentTime(savedProgress.position_seconds);
    }

    if (subtitles?.length) {
      for (const sub of subtitles) {
        api.addRemoteTextTrack(
          {
            kind: 'subtitles',
            src: getSubtitleUrl(sub.id),
            srclang: sub.language,
            label: sub.language,
          },
          false
        );
      }
    }

    api.on('play', () => startSaveInterval());
    api.on('pause', () => {
      stopSaveInterval();
      saveProgress();
    });
    api.on('ended', () => {
      stopSaveInterval();
      saveProgress();
    });
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-black/20">
        {/* Session layout — player + context panel */}
        <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-3rem)]">
          {/* Player area */}
          <div className="flex-1 min-w-0 flex flex-col">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative w-full aspect-video lg:aspect-auto lg:flex-1 bg-black"
            >
              {streamUrl ? (
                <>
                  <VideoPlayer
                    src={streamUrl}
                    type={mimeType}
                    onReady={handlePlayerReady}
                    className="w-full h-full"
                  />
                  <DanmakuOverlay videoElement={videoEl} comments={comments} />
                  <DanmakuSettings />
                </>
              ) : (
                <PlayerPlaceholder mediaInfo={mediaInfo} transcodeStatus={transcodeStatus} />
              )}
            </motion.div>
          </div>

          {/* Resource panel — right side on lg, below on mobile */}
          <motion.aside
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
            className="lg:w-[320px] lg:shrink-0 bg-mm-sidebar overflow-y-auto"
          >
            <div className="p-4 space-y-3">
              {mediaInfo ? (
                <>
                  {/* Section 1: Playback Info */}
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="rounded-lg bg-white/[0.04] p-3"
                  >
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-mm-text-muted mb-2">
                      {i18n._(msg`watch.playbackInfo`)}
                    </h3>
                    <p className="text-[13px] text-white/80 truncate">{mediaInfo.filename}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-white/40">
                      {mediaInfo.width && mediaInfo.height && (
                        <span>
                          {mediaInfo.width}×{mediaInfo.height}
                        </span>
                      )}
                      {mediaInfo.video_codec && <span>{mediaInfo.video_codec.toUpperCase()}</span>}
                      {mediaInfo.audio_codec && <span>{mediaInfo.audio_codec.toUpperCase()}</span>}
                      <span>{formatBytes(mediaInfo.size_bytes)}</span>
                      {mediaInfo.duration_seconds && (
                        <span>{formatDuration(mediaInfo.duration_seconds)}</span>
                      )}
                    </div>
                  </motion.div>

                  {/* Section 2: Playback Method */}
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="rounded-lg bg-white/[0.04] p-3"
                  >
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-mm-text-muted mb-2">
                      {i18n._(msg`watch.playbackMethod`)}
                    </h3>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-white/60">{i18n._(msg`watch.directStream`)}</span>
                        <span
                          className={
                            mediaInfo.can_direct_play ? 'text-green-400' : 'text-red-400/60'
                          }
                        >
                          {mediaInfo.can_direct_play
                            ? i18n._(msg`watch.supported`)
                            : i18n._(msg`watch.unsupported`)}
                        </span>
                      </div>
                      {mediaInfo.needs_transcode && (
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="text-white/60">{i18n._(msg`watch.transcode`)}</span>
                          <span
                            className={cn(
                              transcodeStatus === 'ready'
                                ? 'text-green-400'
                                : transcodeStatus === 'error'
                                  ? 'text-red-400'
                                  : 'text-amber-400'
                            )}
                          >
                            {transcodeStatus === 'ready'
                              ? i18n._(msg`watch.transcodeReady`)
                              : transcodeStatus === 'error'
                                ? i18n._(msg`watch.error.transcodeError`)
                                : i18n._(msg`watch.transcoding`)}
                          </span>
                        </div>
                      )}
                    </div>
                    {transcodeStatus === 'transcoding' && (
                      <div className="mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <motion.div
                          className="h-full bg-mm-accent/60 rounded-full"
                          initial={{ width: '5%' }}
                          animate={{ width: '90%' }}
                          transition={{ duration: 60, ease: 'linear' }}
                        />
                      </div>
                    )}
                  </motion.div>

                  {/* Section 3: Error States */}
                  {!mediaInfo.library_online && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="rounded-lg bg-red-500/10 border border-red-500/20 p-3"
                    >
                      <p className="text-sm font-medium text-red-400">
                        {i18n._(msg`watch.error.offline`)}
                      </p>
                      <p className="text-xs text-red-400/60 mt-1">
                        {i18n._(msg`watch.error.offlineDesc`)}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          queryClient.invalidateQueries({
                            queryKey: mediaKeys.info(fileId!),
                          })
                        }
                        className="mt-2 text-xs text-white/50 hover:text-white/80 transition-colors cursor-pointer"
                      >
                        {i18n._(msg`watch.error.retry`)}
                      </button>
                    </motion.div>
                  )}

                  {transcodeStatus === 'error' && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-lg bg-red-500/10 border border-red-500/20 p-3"
                    >
                      <p className="text-sm font-medium text-red-400">
                        {i18n._(msg`watch.error.transcodeError`)}
                      </p>
                      <button
                        type="button"
                        onClick={() => setTranscodeStatus('idle')}
                        className="mt-2 text-xs text-white/50 hover:text-white/80 transition-colors cursor-pointer"
                      >
                        {i18n._(msg`watch.error.retry`)}
                      </button>
                    </motion.div>
                  )}

                  {/* Section 4: Subtitles */}
                  {subtitles && subtitles.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="rounded-lg bg-white/[0.04] p-3"
                    >
                      <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-mm-text-muted mb-1.5">
                        {i18n._(msg`watch.subtitle`)}
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {subtitles.map((sub) => (
                          <span
                            key={sub.id}
                            className="text-[11px] px-2 py-0.5 rounded bg-white/[0.06] text-mm-text-secondary"
                          >
                            {sub.language}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Section 5: Danmaku */}
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                    className="rounded-lg bg-white/[0.04] p-3"
                  >
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-mm-text-muted mb-1.5">
                      {i18n._(msg`watch.danmaku`)}
                    </h3>
                    <p className="text-[13px] text-mm-text-secondary">
                      {danmakuData
                        ? `${danmakuData.count} ${i18n._(msg`watch.danmaku.count`)}`
                        : i18n._(msg`watch.danmaku.noData`)}
                    </p>
                  </motion.div>
                </>
              ) : (
                /* Skeleton loading state — 3 cards */
                <>
                  <Skeleton className="h-[82px] w-full rounded-lg" />
                  <Skeleton className="h-[72px] w-full rounded-lg" />
                  <Skeleton className="h-[52px] w-full rounded-lg" />
                </>
              )}
            </div>
          </motion.aside>
        </div>
      </div>
    </PageTransition>
  );
}

/* ── Player placeholder shown while stream URL is not yet ready ── */
function PlayerPlaceholder({
  mediaInfo,
  transcodeStatus,
}: {
  mediaInfo: MediaInfo | undefined;
  transcodeStatus: TranscodeStatus;
}) {
  const { i18n } = useLingui();

  return (
    <div className="w-full h-full flex items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-3 text-center px-6">
        {!mediaInfo ? (
          /* No media info yet — generic loading */
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
            <span className="text-sm text-white/40">Loading…</span>
          </div>
        ) : transcodeStatus === 'starting' || transcodeStatus === 'transcoding' ? (
          /* Transcoding in progress */
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
            <div>
              <p className="text-sm font-medium text-white/70">{i18n._(msg`watch.transcoding`)}</p>
              <p className="text-xs text-white/30 mt-0.5">{i18n._(msg`watch.playbackMethod`)}</p>
            </div>
          </div>
        ) : transcodeStatus === 'error' ? (
          /* Transcode error */
          <div className="flex flex-col items-center gap-2">
            <span className="text-2xl">⚠</span>
            <p className="text-sm font-medium text-red-400">
              {i18n._(msg`watch.error.transcodeError`)}
            </p>
          </div>
        ) : !mediaInfo.library_online ? (
          /* Library offline */
          <div className="flex flex-col items-center gap-2">
            <span className="text-2xl">⊘</span>
            <p className="text-sm font-medium text-red-400">{i18n._(msg`watch.error.offline`)}</p>
            <p className="text-xs text-white/30">{i18n._(msg`watch.error.offlineDesc`)}</p>
          </div>
        ) : (
          /* Waiting for direct play URL */
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
            <span className="text-sm text-white/40">Loading…</span>
          </div>
        )}
      </div>
    </div>
  );
}
