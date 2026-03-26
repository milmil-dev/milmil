// web/src/pages/WatchPage.tsx
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useState } from 'react';
import type Player from 'video.js/dist/types/player';
import { DanmakuOverlay } from '@/components/DanmakuOverlay';
import { DanmakuSettings } from '@/components/DanmakuSettings';
import { PageTransition } from '@/components/PageTransition';
import { VideoPlayer } from '@/components/VideoPlayer';
import { type DanmakuComment, getStreamUrl, parseDandanplayComments } from '@/lib/api/stream';
import { usePlayerStore } from '@/store/player-store';

export function WatchPage() {
  const { fileId } = useParams({ strict: false });
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const danmakuOpacity = usePlayerStore((s) => s.danmakuOpacity);
  const danmakuFontSize = usePlayerStore((s) => s.danmakuFontSize);

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

  const comments: DanmakuComment[] = danmakuData?.comments
    ? parseDandanplayComments(danmakuData.comments, danmakuFontSize, danmakuOpacity)
    : [];

  // Stream URL — uses query param token for <video src>
  const streamUrl = fileId ? getStreamUrl(fileId) : '';
  // Use mp4 as default since we don't have the filename here
  // TODO: fetch media file details to get actual filename/type
  const mimeType = 'video/mp4';

  const handlePlayerReady = (player: Player) => {
    const el = player.el()?.querySelector('video') as HTMLVideoElement | null;
    setVideoEl(el);
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
