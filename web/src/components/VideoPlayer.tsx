import '@videojs/react/video/skin.css';
import { createPlayer, usePlayer, videoFeatures } from '@videojs/react';
import { VideoSkin } from '@videojs/react/video';
import { Video } from '@videojs/react/video';
import { HlsVideo } from '@videojs/react/media/hls-video';
import { useEffect, useRef } from 'react';

const Player = createPlayer({ features: videoFeatures });

interface VideoPlayerProps {
  src: string;
  type?: string;
  onReady?: (api: VideoPlayerAPI) => void;
  className?: string;
}

/** Simplified API surface exposed to WatchPage */
export interface VideoPlayerAPI {
  currentTime: (t?: number) => number;
  duration: () => number;
  isDisposed: () => boolean;
  on: (event: string, handler: () => void) => void;
  addRemoteTextTrack: (
    opts: {
      kind: string;
      src: string;
      srclang: string;
      label: string;
    },
    manualCleanup: boolean
  ) => void;
  /** Access the underlying <video> element */
  videoElement: () => HTMLVideoElement | null;
}

function PlayerInner({ src, type, onReady, className }: VideoPlayerProps) {
  const player = usePlayer();
  const readyFired = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Expose a stable API to parent once player is available
  useEffect(() => {
    if (!player || readyFired.current) return;

    // Find the <video> element inside the player container
    const findVideo = (): HTMLVideoElement | null => {
      if (videoRef.current) return videoRef.current;
      const el = document.querySelector('[data-videojs] video') as HTMLVideoElement | null;
      videoRef.current = el;
      return el;
    };

    const api: VideoPlayerAPI = {
      currentTime: (t?: number) => {
        const video = findVideo();
        if (!video) return 0;
        if (t !== undefined) video.currentTime = t;
        return video.currentTime;
      },
      duration: () => findVideo()?.duration ?? 0,
      isDisposed: () => !findVideo(),
      on: (event: string, handler: () => void) => {
        findVideo()?.addEventListener(event, handler);
      },
      addRemoteTextTrack: (opts, _manualCleanup) => {
        const video = findVideo();
        if (!video) return;
        const track = document.createElement('track');
        track.kind = opts.kind;
        track.src = opts.src;
        track.srclang = opts.srclang;
        track.label = opts.label;
        video.appendChild(track);
      },
      videoElement: () => findVideo(),
    };

    readyFired.current = true;
    onReady?.(api);
  }, [player, onReady]);

  const isHLS = type === 'application/x-mpegURL' || src.endsWith('.m3u8');

  return (
    <div className={className} data-videojs>
      <VideoSkin>
        {isHLS ? (
          <HlsVideo src={src} playsInline />
        ) : (
          <Video src={src} playsInline />
        )}
      </VideoSkin>
    </div>
  );
}

export function VideoPlayer(props: VideoPlayerProps) {
  return (
    <Player.Provider>
      <PlayerInner {...props} />
    </Player.Provider>
  );
}
