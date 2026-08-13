import '@videojs/react/video/skin.css';
import type { HlsMedia } from '@videojs/core/dom/media/hls';
import {
  BufferingIndicator,
  Container,
  Controls,
  createPlayer,
  MuteButton,
  PiPButton,
  PlayButton,
  PlaybackRateButton,
  Popover,
  Slider,
  Time,
  TimeSlider,
  Tooltip,
  useMedia,
  usePlayer,
  VolumeSlider,
  videoFeatures,
} from '@videojs/react';
import { HlsVideo } from '@videojs/react/media/hls-video';
import { Video } from '@videojs/react/video';
import type { ReactNode } from 'react';
import { forwardRef, useEffect, useRef, useState } from 'react';

const Player = createPlayer({ features: videoFeatures });

interface VideoPlayerProps {
  src: string;
  type?: string;
  onReady?: (api: VideoPlayerAPI) => void;
  className?: string;
  /** Extra buttons to insert in the control bar (before fullscreen) */
  controlBarExtra?: ReactNode;
  /** HLS buffer configuration */
  hlsConfig?: {
    maxBufferLength: number;
    maxMaxBufferLength: number;
  };
  /** URL for timeline thumbnail VTT file */
  thumbnailsVtt?: string;
  /** Background image shown before playback starts */
  poster?: string;
  /** Custom backdrop element shown before playback starts. Takes priority over `poster`. */
  posterBackdrop?: ReactNode;
}

/** Simplified API surface exposed to WatchPage */
export interface VideoPlayerAPI {
  currentTime: (t?: number) => number;
  duration: () => number;
  isDisposed: () => boolean;
  on: (event: string, handler: () => void) => void;
  videoElement: () => HTMLVideoElement | null;
  containerElement: () => HTMLElement | null;
}

// Reusable button matching the VideoJS skin style
export const SkinButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={`media-button media-button--subtle media-button--icon ${className ?? ''}`}
    {...props}
  />
));

function PlayLabel() {
  const paused = usePlayer((s) => Boolean(s.paused));
  if (usePlayer((s) => Boolean(s.ended))) return 'Replay';
  return paused ? 'Play' : 'Pause';
}

function PiPLabel() {
  return usePlayer((s) => Boolean(s.pip)) ? 'Exit picture-in-picture' : 'Enter picture-in-picture';
}

function VolumePopoverControl() {
  const volumeUnsupported = usePlayer((s) => s.volumeAvailability === 'unsupported');
  const muteBtn = (
    <MuteButton className="media-button--mute" render={<SkinButton />}>
      <svg className="media-icon media-icon--volume-off" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
      </svg>
      <svg className="media-icon media-icon--volume-low" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
      </svg>
      <svg className="media-icon media-icon--volume-high" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
      </svg>
    </MuteButton>
  );
  if (volumeUnsupported) return muteBtn;
  return (
    <Popover.Root openOnHover delay={200} closeDelay={100} side="top">
      <Popover.Trigger render={muteBtn} />
      <Popover.Popup className="media-surface media-popover media-popover--volume">
        <VolumeSlider.Root className="media-slider" orientation="vertical" thumbAlignment="edge">
          <Slider.Track className="media-slider__track">
            <Slider.Fill className="media-slider__fill" />
          </Slider.Track>
          <Slider.Thumb className="media-slider__thumb media-slider__thumb--persistent" />
        </VolumeSlider.Root>
      </Popover.Popup>
    </Popover.Root>
  );
}

function ContainerFullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  return (
    <Tooltip.Root side="top">
      <Tooltip.Trigger
        render={
          <SkinButton
            className="media-button--fullscreen"
            onClick={() => {
              const container = document.getElementById('player-container');
              if (!container) return;
              if (document.fullscreenElement) {
                document.exitFullscreen();
              } else {
                container.requestFullscreen();
              }
            }}
          >
            {isFullscreen ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="media-icon">
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="media-icon">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
              </svg>
            )}
          </SkinButton>
        }
      />
      <Tooltip.Popup className="media-surface media-tooltip">
        {isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      </Tooltip.Popup>
    </Tooltip.Root>
  );
}

function CustomVideoSkin({
  children,
  controlBarExtra,
  prePlayBackdrop,
}: {
  children: ReactNode;
  controlBarExtra?: ReactNode;
  prePlayBackdrop?: ReactNode;
}) {
  return (
    <Container className="media-default-skin media-default-skin--video">
      {children}
      {/* Optional backdrop shown before playback. Rendered between video
          and Controls so it visually covers the video but sits below the
          control UI (DOM order drives stacking in the default container). */}
      {prePlayBackdrop}
      <BufferingIndicator
        render={(props) => (
          <div {...props} className="media-buffering-indicator">
            <div className="media-surface">
              <svg className="media-icon" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"
                  opacity=".25"
                />
                <path d="M12 2a10 10 0 0 1 10 10h-2a8 8 0 0 0-8-8z">
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 12 12"
                    to="360 12 12"
                    dur="1s"
                    repeatCount="indefinite"
                  />
                </path>
              </svg>
            </div>
          </div>
        )}
      />

      <Controls.Root className="media-controls flex flex-col gap-0">
        {/* Progress bar — full width, no side padding (YouTube style) */}
        <div className="w-full">
          <TimeSlider.Root className="media-slider">
            <Slider.Track className="media-slider__track">
              <Slider.Fill className="media-slider__fill" />
              <Slider.Buffer className="media-slider__buffer" />
            </Slider.Track>
            <Slider.Thumb className="media-slider__thumb" />
            <div className="media-preview media-slider__preview">
              <Slider.Thumbnail className="media-preview__thumbnail" />
              <Slider.Value type="pointer" className="media-preview__timestamp" />
            </div>
          </TimeSlider.Root>
        </div>

        {/* Controls row (YouTube layout: play+vol+time ... buttons+fullscreen) */}
        <div className="flex items-center w-full px-1">
          <Tooltip.Provider>
            {/* ── Left group ── */}
            <div className="flex items-center">
              {/* Play / Pause */}
              <Tooltip.Root side="top">
                <Tooltip.Trigger
                  render={
                    <PlayButton className="media-button--play" render={<SkinButton />}>
                      <svg
                        className="media-icon media-icon--restart"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
                      </svg>
                      <svg
                        className="media-icon media-icon--play"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      <svg
                        className="media-icon media-icon--pause"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                      </svg>
                    </PlayButton>
                  }
                />
                <Tooltip.Popup className="media-surface media-tooltip">
                  <PlayLabel />
                </Tooltip.Popup>
              </Tooltip.Root>

              {/* Volume (YouTube: right next to play) */}
              <VolumePopoverControl />

              {/* Time: 00:59 / 23:40 */}
              <Time.Group className="ml-2 flex items-center text-[13px] text-white/90 tabular-nums select-none">
                <Time.Value type="current" />
                <span className="text-white/40 mx-1">/</span>
                <Time.Value type="duration" />
              </Time.Group>
            </div>

            {/* ── Spacer ── */}
            <div className="flex-1" />

            {/* ── Right group ── */}
            <div className="flex items-center">
              {/* Playback speed */}
              <Tooltip.Root side="top">
                <Tooltip.Trigger
                  render={
                    <PlaybackRateButton
                      className="media-button--playback-rate"
                      render={<SkinButton />}
                    />
                  }
                />
                <Tooltip.Popup className="media-surface media-tooltip">
                  Playback speed
                </Tooltip.Popup>
              </Tooltip.Root>

              {/* Custom extra buttons (settings gear) */}
              {controlBarExtra}

              {/* PiP */}
              <Tooltip.Root side="top">
                <Tooltip.Trigger
                  render={
                    <PiPButton className="media-button--pip" render={<SkinButton />}>
                      <svg
                        className="media-icon media-icon--pip-enter"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z" />
                      </svg>
                      <svg
                        className="media-icon media-icon--pip-exit"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-10-7h9v6h-9z" />
                      </svg>
                    </PiPButton>
                  }
                />
                <Tooltip.Popup className="media-surface media-tooltip">
                  <PiPLabel />
                </Tooltip.Popup>
              </Tooltip.Root>

              {/* Fullscreen — targets #player-container so overlays (danmaku, subtitles) are included */}
              <ContainerFullscreenButton />
            </div>
          </Tooltip.Provider>
        </div>
      </Controls.Root>
      <div className="media-overlay" />
      <PauseIndicator />
    </Container>
  );
}

/** Shows a small pause icon in the bottom-right when paused and controls are hidden (idle) */
function PauseIndicator() {
  const paused = usePlayer((s) => Boolean(s.paused));
  const ended = usePlayer((s) => Boolean(s.ended));
  if (!paused || ended) return null;
  return (
    <div
      className="pause-indicator absolute bottom-4 right-4 pointer-events-none
      opacity-0 transition-opacity duration-300 text-white/40"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
      </svg>
    </div>
  );
}

function PlayerInner({
  src,
  type,
  onReady,
  className,
  controlBarExtra,
  hlsConfig,
  thumbnailsVtt,
  poster,
  posterBackdrop,
}: VideoPlayerProps) {
  const player = usePlayer();
  const media = useMedia();
  const readyFired = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hasPlayed, setHasPlayed] = useState(false);

  useEffect(() => {
    if (!player || readyFired.current) return;
    readyFired.current = true;

    // Defer to next frame so containerRef is attached to the DOM
    const rafId = requestAnimationFrame(() => {
      const findVideo = (): HTMLVideoElement | null => {
        if (videoRef.current) return videoRef.current;
        const el = containerRef.current?.querySelector('video') as HTMLVideoElement | null;
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
        videoElement: () => findVideo(),
        containerElement: () => containerRef.current,
      };

      onReady?.(api);
    });

    return () => cancelAnimationFrame(rafId);
  }, [player, onReady]);

  // Apply HLS buffer config to underlying HLS.js engine
  useEffect(() => {
    if (!hlsConfig || !media) return;
    // media is HlsMedia when HLS playback is active — cast and access engine
    const hlsMedia = media as HlsMedia;
    const engine = hlsMedia.engine;
    if (!engine) return;
    engine.config.maxBufferLength = hlsConfig.maxBufferLength;
    engine.config.maxMaxBufferLength = hlsConfig.maxMaxBufferLength;
  }, [hlsConfig, media]);

  // Inject thumbnail track element via DOM API (HlsVideo/Video don't accept children)
  useEffect(() => {
    if (!thumbnailsVtt) return;
    const container = containerRef.current;
    if (!container) return;

    // Wait a frame so the video element is mounted
    const rafId = requestAnimationFrame(() => {
      const videoEl = container.querySelector('video');
      if (!videoEl) return;

      // Remove any existing thumbnail track to avoid duplicates on src change
      const existing = videoEl.querySelector('track[label="thumbnails"]');
      if (existing) existing.remove();

      const track = document.createElement('track');
      track.kind = 'metadata';
      track.label = 'thumbnails';
      track.src = thumbnailsVtt;
      track.default = true;
      videoEl.appendChild(track);
    });

    return () => cancelAnimationFrame(rafId);
  }, [thumbnailsVtt]);

  // Auto-hide controls after 3s idle (works even when paused, like YouTube)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout>;
    const IDLE_MS = 3000;

    const resetIdle = () => {
      el.removeAttribute('data-idle');
      clearTimeout(timer);
      timer = setTimeout(() => el.setAttribute('data-idle', ''), IDLE_MS);
    };

    el.addEventListener('mousemove', resetIdle);
    el.addEventListener('mousedown', resetIdle);
    el.addEventListener('keydown', resetIdle);
    // Start the idle timer
    timer = setTimeout(() => el.setAttribute('data-idle', ''), IDLE_MS);

    return () => {
      clearTimeout(timer);
      el.removeEventListener('mousemove', resetIdle);
      el.removeEventListener('mousedown', resetIdle);
      el.removeEventListener('keydown', resetIdle);
    };
  }, []);

  // Hide poster once video starts playing
  useEffect(() => {
    if (hasPlayed) return;
    const video = containerRef.current?.querySelector('video');
    if (!video) return;
    const onPlay = () => setHasPlayed(true);
    video.addEventListener('playing', onPlay);
    return () => video.removeEventListener('playing', onPlay);
  }, [hasPlayed]);

  const isHLS = type === 'application/x-mpegURL' || src.endsWith('.m3u8');

  // Compose the pre-play backdrop to pass into the skin. Rendered between the
  // video element and the control bar, so the controls still layer on top.
  const backdrop = !hasPlayed ? (
    posterBackdrop ? (
      <div className="absolute inset-0 pointer-events-none">{posterBackdrop}</div>
    ) : poster ? (
      <div className="absolute inset-0 pointer-events-none">
        <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
      </div>
    ) : null
  ) : null;

  return (
    <div ref={containerRef} className={className} data-videojs>
      <CustomVideoSkin controlBarExtra={controlBarExtra} prePlayBackdrop={backdrop}>
        {isHLS ? (
          <HlsVideo src={src} playsInline crossOrigin="anonymous" />
        ) : (
          <Video src={src} playsInline crossOrigin="anonymous" />
        )}
      </CustomVideoSkin>
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
