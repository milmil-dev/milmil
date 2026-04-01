import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DanmakuOverlay } from '@/components/DanmakuOverlay';
import { PageTransition } from '@/components/PageTransition';
import { Skeleton } from '@/components/Skeleton';
import { Spinner } from '@/components/ui/spinner';
import type { VideoPlayerAPI } from '@/components/VideoPlayer';
import { VideoPlayer } from '@/components/VideoPlayer';
import { AnimeInfoSection } from '@/components/watch/AnimeInfoSection';
import { BangumiComments } from '@/components/watch/BangumiComments';
import { DanmakuBar } from '@/components/watch/DanmakuBar';
import { EpisodeSidebar } from '@/components/watch/EpisodeSidebar';
import { EpisodeTitleOverlay } from '@/components/watch/EpisodeTitleOverlay';
import { RelatedAnimeList } from '@/components/watch/RelatedAnimeList';
import { TechInfoPopover } from '@/components/watch/TechInfoPopover';
import { WatchTitleBar } from '@/components/watch/WatchTitleBar';
import { useDocumentTitle } from '@/hooks/use-document-title';
import type { PlayableEpisode } from '@/lib/api/anime';
import { animeApi, animeKeys } from '@/lib/api/anime';
import { discoverApi, discoverKeys } from '@/lib/api/discover';
import { progressApi } from '@/lib/api/progress';
import {
  type DanmakuComment,
  getHLSUrl,
  getMimeType,
  getRemuxUrl,
  getStreamUrl,
  mediaApi,
  mediaKeys,
  parseDandanplayComments,
  streamApi,
} from '@/lib/api/stream';
import { getSubtitleUrl, subtitleApi } from '@/lib/api/subtitle';
import { usePlayerStore } from '@/store/player-store';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';
const SAVE_INTERVAL_MS = 10_000;
const COMPLETION_THRESHOLD_SECONDS = 30;

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function resolveEpisode(episodes: PlayableEpisode[], ep?: number): PlayableEpisode | undefined {
  if (ep !== undefined) {
    return episodes.find((e) => e.sort === ep);
  }
  const inProgress = episodes.find(
    (e) => e.media_file && e.progress && e.progress.position_seconds > 0 && !e.progress.completed
  );
  if (inProgress) return inProgress;
  const fresh = episodes.find((e) => e.media_file && !e.progress);
  if (fresh) return fresh;
  return episodes.find((e) => e.media_file);
}

function ResumeOverlay({ seconds, onDone }: { seconds: number | null; onDone: () => void }) {
  const { i18n } = useLingui();

  useEffect(() => {
    if (seconds === null) return;
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [seconds, onDone]);

  return (
    <AnimatePresence>
      {seconds !== null && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="absolute bottom-14 left-3 z-10 flex items-center gap-2 rounded-md bg-black/70 px-3 py-1.5 backdrop-blur-sm"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-blue-400">
            <path d="M8 3a5 5 0 110 10A5 5 0 018 3zm0 1.5a.5.5 0 00-.5.5v3a.5.5 0 00.5.5h2a.5.5 0 000-1H8.5V5A.5.5 0 008 4.5z" />
          </svg>
          <span className="text-xs text-white/90">
            {i18n._('watch.resumeFrom', { time: formatTime(seconds) })}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function WatchPage() {
  const { i18n } = useLingui();
  useDocumentTitle('Watch');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { animeId } = useParams({ strict: false });
  const { ep } = useSearch({ strict: false }) as { ep?: number };
  const bangumiId = Number(animeId);

  // --------------- Refs ---------------
  const playerRef = useRef<VideoPlayerAPI | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --------------- Transcode state ---------------
  const [transcodeStatus, setTranscodeStatus] = useState<'idle' | 'processing' | 'ready' | 'error'>(
    'idle'
  );
  const [transcodeToken, setTranscodeToken] = useState<string | null>(null);

  // --------------- Resume overlay state ---------------
  const [resumeFrom, setResumeFrom] = useState<number | null>(null);

  // --------------- Core queries ---------------
  const { data: animeDetail, isLoading: detailLoading } = useQuery({
    queryKey: discoverKeys.detail(bangumiId),
    queryFn: () => discoverApi.detail(bangumiId),
    enabled: !Number.isNaN(bangumiId),
  });

  const { data: episodesData, isLoading: episodesLoading } = useQuery({
    queryKey: animeKeys.playableEpisodes(bangumiId),
    queryFn: () => animeApi.playableEpisodes(bangumiId),
    enabled: !Number.isNaN(bangumiId),
  });

  const { data: commentsData, isLoading: commentsLoading } = useQuery({
    queryKey: discoverKeys.comments(bangumiId),
    queryFn: () => discoverApi.comments(bangumiId),
    enabled: !Number.isNaN(bangumiId),
  });

  // --------------- Episode resolution ---------------
  const currentEpisode = useMemo(
    () => resolveEpisode(episodesData?.episodes ?? [], ep),
    [episodesData, ep]
  );
  const fileId = currentEpisode?.media_file?.id ?? null;

  // Auto-sync URL when episode is auto-resolved (no ep param in URL)
  useEffect(() => {
    if (currentEpisode && ep === undefined) {
      navigate({
        to: '/watch/$animeId',
        params: { animeId: String(bangumiId) },
        search: { ep: currentEpisode.sort },
        replace: true,
      });
    }
  }, [currentEpisode, ep, navigate, bangumiId]);

  // --------------- File-dependent queries ---------------
  const { data: mediaInfo } = useQuery({
    queryKey: mediaKeys.info(fileId!),
    queryFn: () => mediaApi.info(fileId!),
    enabled: !!fileId,
  });

  const { data: danmakuRaw } = useQuery({
    queryKey: ['danmaku', fileId],
    queryFn: async () => {
      const token = localStorage.getItem('milmil-token') ?? '';
      const res = await fetch(`${API_URL}/api/v1/danmaku/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { comments: [] };
      return res.json() as Promise<{ comments: { p: string; m: string }[] }>;
    },
    enabled: !!fileId,
  });

  const { data: subtitles } = useQuery({
    queryKey: ['subtitles', fileId],
    queryFn: () => subtitleApi.list(fileId!),
    enabled: !!fileId,
  });

  // --------------- Danmaku parsing ---------------
  const danmakuFontSize = usePlayerStore((s) => s.danmakuFontSize);
  const danmakuOpacity = usePlayerStore((s) => s.danmakuOpacity);

  const danmakuComments: DanmakuComment[] = useMemo(
    () =>
      danmakuRaw?.comments
        ? parseDandanplayComments(danmakuRaw.comments, danmakuFontSize, danmakuOpacity)
        : [],
    [danmakuRaw, danmakuFontSize, danmakuOpacity]
  );

  // --------------- Transcode auto-trigger ---------------
  useEffect(() => {
    if (
      mediaInfo &&
      mediaInfo.needs_transcode &&
      mediaInfo.library_online &&
      transcodeStatus === 'idle' &&
      fileId
    ) {
      setTranscodeStatus('processing');
      streamApi.transcode(fileId).then(
        (res) => {
          if (res.status === 'ready') {
            setTranscodeToken(res.token);
            setTranscodeStatus('ready');
          }
        },
        () => setTranscodeStatus('error')
      );
    }
  }, [mediaInfo, fileId, transcodeStatus]);

  // --------------- WebSocket for transcode ---------------
  useEffect(() => {
    if (transcodeStatus !== 'processing' || !fileId) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${new URL(API_URL).host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'transcode:ready' && msg.file_id === fileId) {
          setTranscodeToken(msg.token);
          setTranscodeStatus('ready');
        } else if (msg.type === 'transcode:error' && msg.file_id === fileId) {
          setTranscodeStatus('error');
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      ws.close();
    };
  }, [transcodeStatus, fileId]);

  // --------------- Stream URL ---------------
  const { streamUrl, mimeType } = useMemo(() => {
    if (!fileId || !mediaInfo) return { streamUrl: null, mimeType: 'video/mp4' };

    // Transcode ready — use HLS
    if (transcodeStatus === 'ready' && transcodeToken) {
      return { streamUrl: getHLSUrl(transcodeToken), mimeType: 'application/x-mpegURL' };
    }
    // Direct play
    if (mediaInfo.can_direct_play) {
      return { streamUrl: getStreamUrl(fileId), mimeType: getMimeType(mediaInfo.filename) };
    }
    // Remux
    if (mediaInfo.can_remux) {
      return { streamUrl: getRemuxUrl(fileId), mimeType: 'video/mp4' };
    }
    // Transcode pending — show nothing yet
    if (mediaInfo.needs_transcode && transcodeStatus !== 'ready') {
      return { streamUrl: null, mimeType: 'video/mp4' };
    }
    // Fallback: try direct
    return { streamUrl: getStreamUrl(fileId), mimeType: getMimeType(mediaInfo.filename) };
  }, [fileId, mediaInfo, transcodeStatus, transcodeToken]);

  // --------------- Video element state ---------------
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  // --------------- Progress saving ---------------
  const saveProgress = useCallback(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed() || !fileId || !currentEpisode) return;

    const position = player.currentTime();
    const duration = player.duration();
    if (!duration || duration <= 0) return;

    const remaining = duration - position;
    const completed = remaining <= COMPLETION_THRESHOLD_SECONDS;

    progressApi.save({
      media_file_id: fileId,
      episode_id: currentEpisode.episode_id,
      position_seconds: Math.floor(position),
      duration_seconds: Math.floor(duration),
      completed,
    });
  }, [fileId, currentEpisode]);

  // Periodic save interval
  useEffect(() => {
    if (!fileId || !currentEpisode) return;

    saveIntervalRef.current = setInterval(saveProgress, SAVE_INTERVAL_MS);
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
        saveIntervalRef.current = null;
      }
    };
  }, [fileId, currentEpisode, saveProgress]);

  // Save on unmount
  useEffect(() => {
    return () => {
      saveProgress();
    };
  }, [saveProgress]);

  // --------------- Player ready handler ---------------
  const handlePlayerReady = useCallback(
    (api: VideoPlayerAPI) => {
      playerRef.current = api;
      const el = api.videoElement();
      videoElRef.current = el;
      setVideoEl(el);

      // Restore progress and show resume overlay
      if (
        currentEpisode?.progress &&
        currentEpisode.progress.position_seconds > 0 &&
        !currentEpisode.progress.completed
      ) {
        const pos = currentEpisode.progress.position_seconds;
        api.currentTime(pos);
        setResumeFrom(pos);
      }

      // Add subtitle tracks
      if (subtitles && subtitles.length > 0) {
        for (const sub of subtitles) {
          api.addRemoteTextTrack(
            {
              kind: 'subtitles',
              src: getSubtitleUrl(sub.id),
              srclang: sub.language,
              label: sub.language,
            },
            true
          );
        }
      }

      // Event handlers for progress saving
      api.on('pause', () => saveProgress());
      api.on('ended', () => {
        if (!fileId || !currentEpisode) return;
        progressApi.save({
          media_file_id: fileId,
          episode_id: currentEpisode.episode_id,
          position_seconds: Math.floor(api.duration()),
          duration_seconds: Math.floor(api.duration()),
          completed: true,
        });
        queryClient.invalidateQueries({ queryKey: animeKeys.playableEpisodes(bangumiId) });
      });
    },
    [currentEpisode, subtitles, saveProgress, fileId, bangumiId, queryClient]
  );

  // --------------- Episode switching ---------------
  const handleSelectEpisode = useCallback(
    (sort: number) => {
      saveProgress();
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
        saveIntervalRef.current = null;
      }
      setTranscodeStatus('idle');
      setTranscodeToken(null);
      setResumeFrom(null);
      setVideoEl(null);
      playerRef.current = null;
      videoElRef.current = null;

      navigate({
        to: '/watch/$animeId',
        params: { animeId: String(bangumiId) },
        search: { ep: sort },
        replace: true,
      });
    },
    [saveProgress, navigate, bangumiId]
  );

  // --------------- Danmaku seek ---------------
  const handleSeekDanmaku = useCallback((time: number) => {
    playerRef.current?.currentTime(time);
  }, []);

  // --------------- Loading skeleton ---------------
  if (detailLoading || episodesLoading) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-black/20">
          <div className="max-w-[1400px] mx-auto px-3 lg:px-6 py-3 lg:py-4">
            {/* Title bar skeleton */}
            <Skeleton className="h-6 w-1/3 mb-2" />
            <Skeleton className="h-4 w-1/5 mb-3" />
            <div className="flex flex-col lg:flex-row gap-3">
              {/* Player skeleton */}
              <div className="flex-1 min-w-0">
                <Skeleton className="aspect-video w-full rounded-lg" />
                <Skeleton className="h-10 w-full mt-2 rounded" />
              </div>
              {/* Sidebar skeleton */}
              <div className="hidden lg:block w-[280px] shrink-0">
                <Skeleton className="h-10 w-full mb-2 rounded" />
                <div className="space-y-2">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-8 w-full rounded" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </PageTransition>
    );
  }

  // --------------- Not found ---------------
  if (!animeDetail || !episodesData) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-black/20 flex items-center justify-center">
          <p className="text-white/50 text-sm">{i18n._(msg`watch.notFound`)}</p>
        </div>
      </PageTransition>
    );
  }

  // --------------- Main render ---------------
  return (
    <PageTransition>
      <div className="min-h-screen bg-black/20">
        <div className="max-w-[1400px] mx-auto px-3 lg:px-6 py-3 lg:py-4">
          {/* Title bar */}
          <WatchTitleBar anime={animeDetail} episodesData={episodesData} bangumiId={bangumiId} />

          <div className="flex flex-col lg:flex-row gap-3">
            {/* LEFT COLUMN */}
            <div className="flex-1 min-w-0">
              {/* Player container */}
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                {streamUrl ? (
                  <>
                    <VideoPlayer
                      src={streamUrl}
                      type={mimeType}
                      onReady={handlePlayerReady}
                      className="absolute inset-0 w-full h-full"
                      controlBarExtra={
                        <TechInfoPopover
                          mediaInfo={mediaInfo}
                          subtitles={subtitles}
                          transcodeStatus={transcodeStatus}
                        />
                      }
                    />
                    <DanmakuOverlay videoElement={videoEl} comments={danmakuComments} />
                    <EpisodeTitleOverlay episode={currentEpisode} />
                    <ResumeOverlay seconds={resumeFrom} onDone={() => setResumeFrom(null)} />
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Spinner size={24} className="text-white/40" />
                  </div>
                )}
              </div>

              {/* Danmaku bar */}
              <DanmakuBar fileId={fileId} danmakuCount={danmakuComments.length} />

              {/* Mobile only: sidebar content */}
              <div className="lg:hidden mt-4">
                <EpisodeSidebar
                  episodes={episodesData.episodes}
                  currentSort={currentEpisode?.sort}
                  onSelectEpisode={handleSelectEpisode}
                  danmakuComments={danmakuComments}
                  onSeekDanmaku={handleSeekDanmaku}
                />
                <RelatedAnimeList relations={animeDetail.relations} />
              </div>

              {/* Anime info */}
              <AnimeInfoSection anime={animeDetail} />

              {/* Comments */}
              <BangumiComments comments={commentsData} isLoading={commentsLoading} />
            </div>

            {/* RIGHT SIDEBAR */}
            <div className="hidden lg:block w-[280px] shrink-0">
              <div className="sticky top-4">
                <EpisodeSidebar
                  episodes={episodesData.episodes}
                  currentSort={currentEpisode?.sort}
                  onSelectEpisode={handleSelectEpisode}
                  danmakuComments={danmakuComments}
                  onSeekDanmaku={handleSeekDanmaku}
                />
                <RelatedAnimeList relations={animeDetail.relations} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
