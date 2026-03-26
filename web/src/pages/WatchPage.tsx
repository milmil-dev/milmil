// web/src/pages/WatchPage.tsx
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

  // Fetch danmaku (may 404 — that's OK)
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

  // Fetch saved progress for this media file
  const { data: savedProgress } = useQuery({
    queryKey: progressKeys.byFile(fileId ?? ''),
    queryFn: () => progressApi.byFile(fileId!),
    enabled: !!fileId,
    retry: false,
  });

  const comments: DanmakuComment[] = danmakuData?.comments
    ? parseDandanplayComments(danmakuData.comments, danmakuFontSize, danmakuOpacity)
    : [];

  // Stream URL — uses query param token for <video src>
  const streamUrl = fileId ? getStreamUrl(fileId) : '';
  // Use mp4 as default since we don't have the filename here
  // TODO: fetch media file details to get actual filename/type
  const mimeType = 'video/mp4';

  // Resolve the episode ID: from search param or from saved progress
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
      .catch(() => {
        // Silent — background sync, no toast
      });
  }, [fileId, resolvedEpisodeId]);

  // Set up periodic save interval
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

  // Cleanup interval and save on unmount
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

    // Restore saved position
    if (savedProgress && savedProgress.position_seconds > 0 && !savedProgress.completed) {
      player.currentTime(savedProgress.position_seconds);
    }

    // Start saving on play, stop on pause
    player.on('play', () => {
      startSaveInterval();
    });

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
      <div className="min-h-screen bg-mm-bg">
        <div className="max-w-[1200px] mx-auto px-4 pt-4 pb-16">
          {/* Player container */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative w-full aspect-video rounded-lg overflow-hidden bg-black"
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

          {/* File info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-4"
          >
            <p className="text-sm text-mm-text-tertiary">
              {danmakuData ? `${danmakuData.count} 條彈幕` : '無彈幕數據'}
            </p>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
