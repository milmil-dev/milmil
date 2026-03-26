import { useQuery } from '@tanstack/react-query';
import { useParams, useSearch } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type Player from 'video.js/dist/types/player';
import { DanmakuOverlay } from '@/components/DanmakuOverlay';
import { DanmakuSettings } from '@/components/DanmakuSettings';
import { PageTransition } from '@/components/PageTransition';
import { VideoPlayer } from '@/components/VideoPlayer';
import { progressApi, progressKeys } from '@/lib/api/progress';
import { type DanmakuComment, getStreamUrl, parseDandanplayComments } from '@/lib/api/stream';
import { getSubtitleUrl, subtitleApi } from '@/lib/api/subtitle';
import { usePlayerStore } from '@/store/player-store';

const SAVE_INTERVAL_MS = 10_000;
const COMPLETION_THRESHOLD_SECONDS = 30;

export function WatchPage() {
  const { fileId } = useParams({ strict: false });
  const { episodeId } = useSearch({ strict: false }) as { episodeId?: string };
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const danmakuOpacity = usePlayerStore((s) => s.danmakuOpacity);
  const danmakuFontSize = usePlayerStore((s) => s.danmakuFontSize);

  const playerRef = useRef<Player | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const comments: DanmakuComment[] = danmakuData?.comments
    ? parseDandanplayComments(danmakuData.comments, danmakuFontSize, danmakuOpacity)
    : [];

  const streamUrl = fileId ? getStreamUrl(fileId) : '';
  const mimeType = 'video/mp4';
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

  const handlePlayerReady = (player: Player) => {
    const el = player.el()?.querySelector('video') as HTMLVideoElement | null;
    setVideoEl(el);
    playerRef.current = player;

    if (savedProgress && savedProgress.position_seconds > 0 && !savedProgress.completed) {
      player.currentTime(savedProgress.position_seconds);
    }

    if (subtitles?.length) {
      for (const sub of subtitles) {
        player.addRemoteTextTrack(
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

    player.on('play', () => startSaveInterval());
    player.on('pause', () => {
      stopSaveInterval();
      saveProgress();
    });
    player.on('ended', () => {
      stopSaveInterval();
      saveProgress();
    });
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-black/20">
        {/* Session layout — player + context panel */}
        <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-3.5rem)]">
          {/* Player area */}
          <div className="flex-1 min-w-0 flex flex-col">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative w-full aspect-video lg:aspect-auto lg:flex-1 bg-black"
            >
              <VideoPlayer
                src={streamUrl}
                type={mimeType}
                onReady={handlePlayerReady}
                className="w-full h-full"
              />
              <DanmakuOverlay videoElement={videoEl} comments={comments} />
              <DanmakuSettings />
            </motion.div>
          </div>

          {/* Context panel — right side on lg, below on mobile */}
          <motion.aside
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
            className="lg:w-[320px] lg:shrink-0 bg-mm-sidebar overflow-y-auto"
          >
            <div className="p-4 space-y-4">
              {/* Danmaku status */}
              <div className="rounded-lg bg-mm-surface/50 p-3">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-mm-text-muted mb-1.5">
                  彈幕
                </h3>
                <p className="text-[13px] text-mm-text-secondary">
                  {danmakuData ? `${danmakuData.count} 條彈幕` : '無彈幕數據'}
                </p>
              </div>

              {/* Subtitle info */}
              {subtitles && subtitles.length > 0 && (
                <div className="rounded-lg bg-mm-surface/50 p-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-mm-text-muted mb-1.5">
                    字幕
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
                </div>
              )}

              {/* File info */}
              <div className="rounded-lg bg-mm-surface/50 p-3">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-mm-text-muted mb-1.5">
                  媒體檔案
                </h3>
                <p className="text-[12px] font-mono text-mm-text-tertiary break-all">
                  {fileId ?? 'Unknown'}
                </p>
              </div>
            </div>
          </motion.aside>
        </div>
      </div>
    </PageTransition>
  );
}
