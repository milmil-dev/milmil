import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DanmakuOverlay } from '@/components/DanmakuOverlay';
import { PageTransition } from '@/components/PageTransition';
import { Skeleton } from '@/components/Skeleton';
import { Spinner } from '@/components/ui/spinner';
import type { VideoPlayerAPI } from '@/components/VideoPlayer';
import { SkinButton, VideoPlayer } from '@/components/VideoPlayer';
import { AnimeInfoSection } from '@/components/watch/AnimeInfoSection';
import { BangumiComments } from '@/components/watch/BangumiComments';
import { DanmakuBar } from '@/components/watch/DanmakuBar';
import { EpisodeSidebar } from '@/components/watch/EpisodeSidebar';
import { EpisodeTitleOverlay } from '@/components/watch/EpisodeTitleOverlay';
import { RelatedAnimeList } from '@/components/watch/RelatedAnimeList';
import { TechInfoPopover } from '@/components/watch/TechInfoPopover';
import { UnifiedSettingsPanel } from '@/components/watch/UnifiedSettingsPanel';
import { WatchTitleBar } from '@/components/watch/WatchTitleBar';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useSeriesPreferences } from '@/hooks/use-series-preferences';
import type { PlayableEpisode } from '@/lib/api/anime';
import { animeApi, animeKeys } from '@/lib/api/anime';
import { externalDanmakuApi, externalDanmakuKeys } from '@/lib/api/danmaku';
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
  streamApi,
} from '@/lib/api/stream';
import { getSubtitleUrl, subtitleApi } from '@/lib/api/subtitle';
import { formatLanguage } from '@/lib/format';
import { MemoryMonitor } from '@/lib/memory-monitor';
import { NetworkMonitor } from '@/lib/network-monitor';
import { cn } from '@/lib/utils';
import type { CapturePluginAPI } from '@/plugins/capture/CapturePlugin';
import { createCapturePlugin } from '@/plugins/capture/CapturePlugin';
import type { GesturePluginAPI } from '@/plugins/gesture/GesturePlugin';
import { createGesturePlugin } from '@/plugins/gesture/GesturePlugin';
import type { KeyboardPluginAPI } from '@/plugins/keyboard/KeyboardPlugin';
import { createKeyboardPlugin } from '@/plugins/keyboard/KeyboardPlugin';
import type { MediaSettingsPluginAPI } from '@/plugins/media-settings/MediaSettingsPlugin';
import { createMediaSettingsPlugin } from '@/plugins/media-settings/MediaSettingsPlugin';
import type { PlaybackPluginAPI } from '@/plugins/playback/PlaybackPlugin';
import { createPlaybackPlugin } from '@/plugins/playback/PlaybackPlugin';
import type { SubtitlePluginAPI } from '@/plugins/subtitle/SubtitlePlugin';
import { createSubtitlePlugin } from '@/plugins/subtitle/SubtitlePlugin';
// SubtitleSettingsPanel replaced by UnifiedSettingsPanel
import type { SubtitleTrack } from '@/plugins/subtitle/types';
import { useBgStore } from '@/store/bg-store';
import { usePreferencesStore } from '@/store/preferences-store';

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
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, [seconds, onDone]);

  return (
    <AnimatePresence>
      {seconds !== null && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
          className="absolute bottom-20 left-3 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-black/55 py-1.5 pl-3 pr-2 backdrop-blur-xl shadow-md shadow-black/30"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-white/70">
            <path d="M13 3a9 9 0 100 18 9 9 0 000-18zm-1 5h1.5v4.25L17 14.5l-.75 1.3L12 13V8z" />
          </svg>
          <span className="text-[11px] text-white/80">{i18n._('watch.resumeFrom')}</span>
          <span className="text-[11px] font-medium tabular-nums text-white">
            {formatTime(seconds)}
          </span>
          <button
            type="button"
            onClick={onDone}
            aria-label="Dismiss"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function WatchPage() {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { animeId } = useParams({ strict: false });
  const { ep } = useSearch({ strict: false }) as { ep?: number };
  const bangumiId = Number(animeId);

  // Per-series + global preferences (subtitle/audio language, etc.)
  const seriesPrefs = useSeriesPreferences(
    Number.isFinite(bangumiId) ? String(bangumiId) : undefined
  );
  const defaultSubtitleLanguage = usePreferencesStore((s) => s.defaultSubtitleLanguage);

  // --------------- Refs ---------------
  const playerRef = useRef<VideoPlayerAPI | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subtitlePluginRef = useRef<SubtitlePluginAPI | null>(null);
  const keyboardPluginRef = useRef<KeyboardPluginAPI | null>(null);
  const mediaSettingsPluginRef = useRef<MediaSettingsPluginAPI | null>(null);
  const playbackPluginRef = useRef<PlaybackPluginAPI | null>(null);
  const gesturePluginRef = useRef<GesturePluginAPI | null>(null);
  const capturePluginRef = useRef<CapturePluginAPI | null>(null);
  const navigateToNextEpisodeRef = useRef<() => void>(() => {});

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

  // Heterogeneous poster pool for the loading-state backdrop (login-style wall).
  const { data: trendingForBackdrop } = useQuery({
    queryKey: discoverKeys.trending(1),
    queryFn: () => discoverApi.trending(1),
    staleTime: 30 * 60 * 1000,
  });

  const watchTitle = animeDetail?.title
    ? ep
      ? `${animeDetail.title} EP${ep}`
      : animeDetail.title
    : undefined;
  useDocumentTitle(watchTitle);

  // Set full-screen background image (Seanime style)
  const setImage = useBgStore((s) => s.setImage);
  useEffect(() => {
    const img = animeDetail?.banner_image || animeDetail?.cover_image;
    if (img?.startsWith('http')) {
      setImage(img, { dimMode: 'scroll-up' });
    }
    return () => setImage(null);
  }, [animeDetail?.banner_image, animeDetail?.cover_image, setImage]);

  const { data: episodesData, isLoading: episodesLoading } = useQuery({
    queryKey: animeKeys.playableEpisodes(bangumiId),
    queryFn: () => animeApi.playableEpisodes(bangumiId),
    enabled: !Number.isNaN(bangumiId),
    retry: false, // Don't retry on 404 (anime not in local DB)
  });

  // Fetch metadata episodes as fallback when local DB has none
  const { data: metadataEpisodes, isLoading: metaEpisodesLoading } = useQuery({
    queryKey: discoverKeys.episodes(bangumiId),
    queryFn: () => discoverApi.episodes(bangumiId),
    enabled: !Number.isNaN(bangumiId),
  });

  // Merge: use playable episodes if available, fill gaps from metadata
  const mergedEpisodes: PlayableEpisode[] = useMemo(() => {
    const playable = episodesData?.episodes ?? [];
    const meta = metadataEpisodes ?? [];
    if (playable.length > 0 && playable.length >= meta.length) return playable;

    // Build lookup of playable episodes by sort number
    const playableMap = new Map(playable.map((ep) => [ep.sort, ep]));

    // Create merged list from metadata, using playable data when available
    return meta.map((mep) => {
      const existing = playableMap.get(mep.sort);
      if (existing) return existing;
      // Create stub episode from metadata — no media file
      return {
        episode_id: `meta-${mep.bangumi_episode_id}`,
        sort: mep.sort,
        title: mep.title || null,
        title_zh: mep.title_original || null,
        air_date: mep.air_date || null,
        synopsis: mep.synopsis || null,
        synopsis_zh: null,
        image: mep.image || null,
        media_file: null,
        progress: null,
      } satisfies PlayableEpisode;
    });
  }, [episodesData, metadataEpisodes]);

  const { data: commentsData, isLoading: commentsLoading } = useQuery({
    queryKey: discoverKeys.comments(bangumiId),
    queryFn: () => discoverApi.comments(bangumiId),
    enabled: !Number.isNaN(bangumiId),
  });

  // --------------- Episode resolution ---------------
  const currentEpisode = useMemo(() => resolveEpisode(mergedEpisodes, ep), [mergedEpisodes, ep]);
  const fileId = currentEpisode?.media_file?.id ?? null;
  const episodeId = currentEpisode?.episode_id ?? null;

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

  // --------------- Danmaku parsing (via WebWorker) ---------------
  const danmakuFontSize = usePreferencesStore((s) => s.danmakuFontSize);
  const danmakuOpacity = usePreferencesStore((s) => s.danmakuOpacity);
  const danmakuDensity = usePreferencesStore((s) => s.danmakuDensity);
  const [danmakuComments, setDanmakuComments] = useState<DanmakuComment[]>([]);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    try {
      workerRef.current = new Worker(new URL('../workers/danmaku-worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current.onmessage = (e: MessageEvent<DanmakuComment[]>) => {
        setDanmakuComments(e.data);
      };
    } catch {
      workerRef.current = null;
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!danmakuRaw?.comments?.length) {
      setDanmakuComments([]);
      return;
    }
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const input = {
      comments: danmakuRaw.comments,
      fontSize: danmakuFontSize,
      opacity: danmakuOpacity,
      density: danmakuDensity,
      isMobile,
    };
    if (workerRef.current) {
      workerRef.current.postMessage(input);
    } else {
      import('../workers/danmaku-worker').then(({ processDanmaku }) => {
        setDanmakuComments(processDanmaku(input));
      });
    }
  }, [danmakuRaw, danmakuFontSize, danmakuOpacity, danmakuDensity]);

  // --------------- External imported danmaku ---------------
  const { data: importedDanmaku, refetch: refetchImported } = useQuery({
    queryKey: externalDanmakuKeys.imported(episodeId ?? ''),
    queryFn: () => externalDanmakuApi.getImported(episodeId!),
    enabled: !!episodeId,
  });

  const mergedDanmakuComments = useMemo(() => {
    if (!importedDanmaku?.length) return danmakuComments;
    const imported: DanmakuComment[] = importedDanmaku.flatMap((source) =>
      source.comments.map((c) => ({
        text: c.text,
        time: c.time,
        mode: c.mode as 'rtl' | 'top' | 'bottom',
        style: {
          fontSize: `${danmakuFontSize}px`,
          color: c.color,
          opacity: danmakuOpacity,
        },
      }))
    );
    return [...danmakuComments, ...imported];
  }, [danmakuComments, importedDanmaku, danmakuFontSize, danmakuOpacity]);

  // --------------- Adaptive buffering ---------------
  const bufferMode = usePreferencesStore((s) => s.bufferMode);
  const networkMonitorRef = useRef<NetworkMonitor | null>(null);
  const [activeBufferProfile, setActiveBufferProfile] = useState<'low' | 'balanced' | 'high'>(
    'balanced'
  );

  useEffect(() => {
    if (bufferMode !== 'auto') {
      setActiveBufferProfile(bufferMode as 'low' | 'balanced' | 'high');
      return;
    }
    const monitor = new NetworkMonitor();
    networkMonitorRef.current = monitor;
    const profileMap = { fast: 'high', medium: 'balanced', slow: 'low' } as const;
    setActiveBufferProfile(profileMap[monitor.getProfile()]);
    const unsub = monitor.subscribe((profile) => {
      setActiveBufferProfile(profileMap[profile]);
    });
    return () => {
      unsub();
      monitor.destroy();
      networkMonitorRef.current = null;
    };
  }, [bufferMode]);

  const hlsBufferConfig = useMemo(() => {
    const configs = {
      low: { maxBufferLength: 15, maxMaxBufferLength: 30 },
      balanced: { maxBufferLength: 30, maxMaxBufferLength: 60 },
      high: { maxBufferLength: 60, maxMaxBufferLength: 120 },
    };
    return configs[activeBufferProfile];
  }, [activeBufferProfile]);

  // --------------- Memory monitoring ---------------
  const memoryMonitorRef = useRef<MemoryMonitor | null>(null);

  useEffect(() => {
    const monitor = new MemoryMonitor();
    memoryMonitorRef.current = monitor;
    const unsub = monitor.subscribe((event) => {
      const store = usePreferencesStore.getState();
      if (event === 'memory-pressure') {
        if (store.bufferMode === 'auto') {
          setActiveBufferProfile('low');
        }
        toast.info(i18n._(msg`player.memoryPressure`));
      } else {
        if (store.bufferMode === 'auto') {
          const profileMap = { fast: 'high', medium: 'balanced', slow: 'low' } as const;
          const netProfile = networkMonitorRef.current?.getProfile() ?? 'medium';
          setActiveBufferProfile(profileMap[netProfile]);
        }
        toast.info(i18n._(msg`player.memoryNormal`));
      }
    });
    return () => {
      unsub();
      monitor.destroy();
      memoryMonitorRef.current = null;
    };
  }, [i18n]);

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

  // --------------- Thumbnail VTT URL ---------------
  const thumbnailsVttUrl = fileId
    ? `${API_URL}/api/v1/stream/${fileId}/thumbnails?token=${encodeURIComponent(localStorage.getItem('milmil-token') ?? '')}`
    : undefined;

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
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

  // Theater mode — YouTube-style wide layout that hides the episode sidebar
  // and caps the player to viewport height. Persisted across sessions.
  const [theaterMode, setTheaterMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mm_theater_mode') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('mm_theater_mode', theaterMode ? '1' : '0');
    } catch {
      // ignore: incognito / storage disabled
    }
  }, [theaterMode]);

  // YouTube-style "T" shortcut to toggle theater mode.
  // Ignored when user is typing into an input / textarea / contenteditable.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 't' && e.key !== 'T') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      setTheaterMode((v) => !v);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  // Dispose all plugins on unmount
  useEffect(() => {
    return () => {
      subtitlePluginRef.current?.dispose();
      keyboardPluginRef.current?.dispose();
      mediaSettingsPluginRef.current?.dispose();
      playbackPluginRef.current?.dispose();
      gesturePluginRef.current?.dispose();
      capturePluginRef.current?.dispose();
    };
  }, []);

  // --------------- Player ready handler ---------------
  const handlePlayerReady = useCallback(
    (api: VideoPlayerAPI) => {
      playerRef.current = api;
      const el = api.videoElement();
      videoElRef.current = el;
      setVideoEl(el);

      // Initialize all plugins
      const containerEl = api.containerElement();
      if (el && containerEl) {
        const prefs = usePreferencesStore.getState();

        // --- Subtitle plugin ---
        subtitlePluginRef.current?.dispose();
        const appLocale = i18n.locale ?? 'zh-TW';
        const subtitlePlugin = createSubtitlePlugin(el, containerEl, appLocale);
        subtitlePluginRef.current = subtitlePlugin;

        // Preferred language chain: per-series > global default > (plugin falls back to appLocale)
        const preferredLang =
          seriesPrefs.prefs?.subtitleLanguage ?? defaultSubtitleLanguage ?? null;
        subtitlePlugin.setPreferredLanguage(preferredLang);

        // Apply stored subtitle delay
        if (typeof seriesPrefs.prefs?.subtitleDelay === 'number') {
          subtitlePlugin.setDelay(seriesPrefs.prefs.subtitleDelay);
        }

        // Load tracks if subtitles are already available
        if (subtitles && subtitles.length > 0) {
          subtitlePlugin.loadTracks(
            subtitles.map((s) => ({
              id: s.id,
              label: formatLanguage(s.language, i18n.locale ?? 'en') || s.language,
              language: s.language,
              source: (s.source === 'embedded'
                ? 'embedded'
                : 'external') as SubtitleTrack['source'],
              format: 'vtt' as SubtitleTrack['format'], // backend always converts to VTT
              url: getSubtitleUrl(s.id),
            }))
          );
        }

        // --- Keyboard plugin ---
        keyboardPluginRef.current?.dispose();
        keyboardPluginRef.current = createKeyboardPlugin(el, containerEl, {
          customBindings: prefs.keyboardBindings,
          onNextEpisode: () => navigateToNextEpisodeRef.current(),
        });

        // --- Media Settings plugin ---
        mediaSettingsPluginRef.current?.dispose();
        mediaSettingsPluginRef.current = createMediaSettingsPlugin(el, containerEl);

        // --- Playback plugin ---
        playbackPluginRef.current?.dispose();
        const playbackPlugin = createPlaybackPlugin(el, containerEl);
        playbackPlugin.onNextEpisode(() => navigateToNextEpisodeRef.current());
        playbackPlugin.setAutoNext(prefs.autoNext);
        playbackPlugin.setAutoSkip(prefs.autoSkipOp, prefs.autoSkipEd);
        playbackPluginRef.current = playbackPlugin;

        // --- Gesture plugin ---
        gesturePluginRef.current?.dispose();
        gesturePluginRef.current = createGesturePlugin(el, containerEl, {
          enabled: prefs.gestureEnabled,
          sensitivity: prefs.gestureSensitivity,
        });

        // --- Capture plugin ---
        capturePluginRef.current?.dispose();
        capturePluginRef.current = createCapturePlugin(el, containerEl);

        // --- Inter-plugin communication: keyboard -> subtitle ---
        containerEl.addEventListener('plugin-action', ((e: CustomEvent) => {
          const sp = subtitlePluginRef.current;
          if (!sp) return;
          switch (e.detail.action) {
            case 'subtitle:toggle':
              sp.toggle();
              break;
            case 'subtitle:next-track':
              sp.nextTrack();
              break;
            case 'subtitle:delay-decrease':
              sp.adjustDelay(-0.1);
              break;
            case 'subtitle:delay-increase':
              sp.adjustDelay(0.1);
              break;
          }
        }) as EventListener);
      }

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
    [currentEpisode, saveProgress, fileId, bangumiId, queryClient, subtitles, i18n.locale]
  );

  // --------------- Subtitle tracks (reload when subtitles query updates) ---------------
  useEffect(() => {
    const plugin = subtitlePluginRef.current;
    if (!plugin || !subtitles || subtitles.length === 0) return;

    plugin.loadTracks(
      subtitles.map((s) => ({
        id: s.id,
        label: s.language,
        language: s.language,
        source: (s.source === 'embedded' ? 'embedded' : 'external') as SubtitleTrack['source'],
        format: 'vtt' as SubtitleTrack['format'], // backend always converts to VTT
        url: getSubtitleUrl(s.id),
      }))
    );
  }, [subtitles]);

  // --------------- Apply preferred language when series prefs arrive late ---------------
  useEffect(() => {
    const plugin = subtitlePluginRef.current;
    if (!plugin) return;
    const preferredLang = seriesPrefs.prefs?.subtitleLanguage ?? defaultSubtitleLanguage ?? null;
    plugin.setPreferredLanguage(preferredLang);
    if (typeof seriesPrefs.prefs?.subtitleDelay === 'number') {
      plugin.setDelay(seriesPrefs.prefs.subtitleDelay);
    }
  }, [
    seriesPrefs.prefs?.subtitleLanguage,
    seriesPrefs.prefs?.subtitleDelay,
    defaultSubtitleLanguage,
  ]);

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

      // Dispose all plugins
      subtitlePluginRef.current?.dispose();
      subtitlePluginRef.current = null;
      keyboardPluginRef.current?.dispose();
      keyboardPluginRef.current = null;
      mediaSettingsPluginRef.current?.dispose();
      mediaSettingsPluginRef.current = null;
      playbackPluginRef.current?.dispose();
      playbackPluginRef.current = null;
      gesturePluginRef.current?.dispose();
      gesturePluginRef.current = null;
      capturePluginRef.current?.dispose();
      capturePluginRef.current = null;

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

  // --------------- Navigate to next episode ---------------
  const navigateToNextEpisode = useCallback(() => {
    if (!currentEpisode) return;
    const currentIdx = mergedEpisodes.findIndex((e) => e.sort === currentEpisode.sort);
    const nextEp = mergedEpisodes[currentIdx + 1];
    if (nextEp?.media_file) {
      handleSelectEpisode(nextEp.sort);
    }
  }, [currentEpisode, mergedEpisodes, handleSelectEpisode]);
  navigateToNextEpisodeRef.current = navigateToNextEpisode;

  // --------------- Sync preferences to plugins ---------------
  useEffect(() => {
    const unsub = usePreferencesStore.subscribe((state) => {
      keyboardPluginRef.current?.updateBindings(state.keyboardBindings);
      gesturePluginRef.current?.setEnabled(state.gestureEnabled);
      gesturePluginRef.current?.setSensitivity(state.gestureSensitivity);
      playbackPluginRef.current?.setAutoNext(state.autoNext);
      playbackPluginRef.current?.setAutoSkip(state.autoSkipOp, state.autoSkipEd);
    });
    return unsub;
  }, []);

  // --------------- Danmaku seek ---------------
  const handleSeekDanmaku = useCallback((time: number) => {
    playerRef.current?.currentTime(time);
  }, []);

  // --------------- Loading skeleton ---------------
  if (detailLoading || (episodesLoading && metaEpisodesLoading)) {
    return (
      <PageTransition>
        <div className="min-h-screen">
          <div className="mx-auto px-3 lg:px-6 py-3 lg:py-4 max-w-[1400px]">
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
              <div className="hidden lg:block w-[480px] shrink-0">
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
  if (!animeDetail || mergedEpisodes.length === 0) {
    return (
      <PageTransition>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-white/50 text-sm">{i18n._(msg`watch.notFound`)}</p>
        </div>
      </PageTransition>
    );
  }

  // --------------- Main render ---------------
  const playerBg = animeDetail.banner_image || animeDetail.cover_image;

  // Build a poster pool for the login-style wall backdrop shown before
  // playback starts. Requires at least 3 distinct covers — falls back to
  // nothing if trending hasn't loaded yet (prevents the "140 tiles of the
  // same cover" anti-pattern).
  const loadingWallPosters: string[] = (() => {
    const unique = new Set<string>();
    if (animeDetail.cover_image?.startsWith('http')) unique.add(animeDetail.cover_image);
    for (const a of trendingForBackdrop ?? []) {
      if (a.cover_image?.startsWith('http')) unique.add(a.cover_image);
    }
    const pool = Array.from(unique);
    if (pool.length < 3) return [];
    const SLOTS = 140;
    const out: string[] = [];
    while (out.length < SLOTS) out.push(...pool);
    return out.slice(0, SLOTS);
  })();

  const posterWallBackdrop =
    loadingWallPosters.length > 0 ? (
      <div className="absolute inset-0 overflow-hidden bg-mm-bg">
        <div
          className="absolute left-[-40%] right-[-40%] top-[-20%] bottom-[-20%] opacity-55"
          style={{
            transform: 'perspective(1400px) rotateY(-22deg) rotateZ(2deg)',
            transformOrigin: '50% 50%',
            transformStyle: 'preserve-3d',
          }}
        >
          <div
            className="grid gap-x-[5px] gap-y-[10px]"
            style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}
          >
            {loadingWallPosters.map((src, i) => (
              <div key={`${src}-${i}`} className="aspect-[2/3] overflow-hidden rounded-[3px]">
                <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        </div>
        {/* Stronger dark layer — backdrop should whisper, not shout */}
        <div className="absolute inset-0 bg-black/75" />
        {/* Vignette: dim center only slightly, edges fade to full bg */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 75% 75% at 50% 50%, rgba(7,7,7,0.45) 0%, rgba(7,7,7,0.80) 70%, var(--mm-bg) 100%)',
          }}
        />
      </div>
    ) : null;

  return (
    <PageTransition>
      <div className="min-h-screen">
        <div className="mx-auto px-3 lg:px-6 py-3 lg:py-4">
          {/* Title bar */}
          <WatchTitleBar
            anime={animeDetail}
            episodesData={
              episodesData ?? {
                watch_status: 'unwatched',
                mal_id: null,
                tmdb_id: null,
                episodes: mergedEpisodes,
              }
            }
            bangumiId={bangumiId}
          />

          <div className="flex flex-col lg:flex-row gap-3">
            {/* LEFT COLUMN */}
            <div className="flex-1 min-w-0">
              {/* Player container — caps by viewport height only in theater mode
                  so the player is never taller than the viewport. In default mode
                  the column's max-width (see below) already does the capping. */}
              <div
                id="player-container"
                className="relative aspect-video overflow-hidden bg-black lg:mx-auto"
                style={
                  theaterMode
                    ? { maxWidth: 'min(calc((100vh - 140px) * 16 / 9), 1600px)' }
                    : undefined
                }
              >
                {streamUrl ? (
                  <>
                    <VideoPlayer
                      src={streamUrl}
                      type={mimeType}
                      thumbnailsVtt={thumbnailsVttUrl}
                      poster={playerBg}
                      posterBackdrop={posterWallBackdrop}
                      onReady={handlePlayerReady}
                      className="absolute inset-0 w-full h-full"
                      hlsConfig={hlsBufferConfig}
                      controlBarExtra={
                        <>
                          {/* Theater mode toggle — YouTube-style (T) */}
                          <SkinButton
                            onClick={() => setTheaterMode((v) => !v)}
                            aria-label={theaterMode ? 'Default view' : 'Theater mode'}
                            title={theaterMode ? 'Default view (T)' : 'Theater mode (T)'}
                          >
                            {theaterMode ? (
                              /* Exit theater — inner rectangle */
                              <svg
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                className="media-icon"
                                style={{ width: 20, height: 20 }}
                              >
                                <path d="M19 6.5H5c-1.1 0-2 .9-2 2v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7c0-1.1-.9-2-2-2zm0 9H5v-7h14v7z" />
                              </svg>
                            ) : (
                              /* Enter theater — wider rectangle */
                              <svg
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                className="media-icon"
                                style={{ width: 20, height: 20 }}
                              >
                                <path d="M19 7.5H5c-1.1 0-2 .9-2 2v5c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-5c0-1.1-.9-2-2-2zm0 7H5v-5h14v5z" />
                              </svg>
                            )}
                          </SkinButton>
                          {/* Settings */}
                          <SkinButton
                            onClick={() => setSettingsPanelOpen((v) => !v)}
                            aria-label="Settings"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              className="media-icon"
                              style={{ width: 20, height: 20 }}
                            >
                              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                            </svg>
                          </SkinButton>
                        </>
                      }
                    />

                    {/* Unified settings panel */}
                    <AnimatePresence>
                      {settingsPanelOpen && (
                        <UnifiedSettingsPanel
                          subtitlePlugin={subtitlePluginRef.current}
                          mediaPlugin={mediaSettingsPluginRef.current}
                          videoEl={videoEl}
                          onClose={() => setSettingsPanelOpen(false)}
                          onSubtitleChange={(track) => {
                            const lang = track?.language ?? '';
                            seriesPrefs.save({ subtitleLanguage: lang });
                            if (lang) {
                              usePreferencesStore
                                .getState()
                                .updatePreference('defaultSubtitleLanguage', lang);
                            }
                          }}
                          onAudioChange={(language) => {
                            seriesPrefs.save({ audioTrackLanguage: language });
                            if (language) {
                              usePreferencesStore
                                .getState()
                                .updatePreference('defaultAudioLanguage', language);
                            }
                          }}
                          onSubtitleDelayChange={(seconds) => {
                            seriesPrefs.save({ subtitleDelay: seconds });
                          }}
                        />
                      )}
                    </AnimatePresence>

                    <DanmakuOverlay videoElement={videoEl} comments={mergedDanmakuComments} />
                    <EpisodeTitleOverlay episode={currentEpisode} />
                    <ResumeOverlay seconds={resumeFrom} onDone={() => setResumeFrom(null)} />
                  </>
                ) : (
                  /* Loading state — show player shell with spinner overlay */
                  <div className="absolute inset-0 flex flex-col">
                    {/* Login-style tilted poster wall (current anime cover + trending covers) */}
                    {posterWallBackdrop && (
                      <div className="pointer-events-none absolute inset-0">
                        {posterWallBackdrop}
                      </div>
                    )}
                    <div className="relative flex-1 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-3">
                        <Spinner size={32} className="text-white/50" />
                        {mediaInfo?.needs_transcode && transcodeStatus === 'processing' && (
                          <span className="text-xs text-white/40">
                            {i18n._(msg`watch.transcoding`)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Faux control bar so layout doesn't jump */}
                    <div className="relative h-11 bg-black/60 border-t border-white/[0.04] flex items-center px-3">
                      <div className="flex items-center gap-2 opacity-30 pointer-events-none">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        <span className="text-xs text-white/60 tabular-nums">0:00 / --:--</span>
                      </div>
                      <div className="flex-1" />
                    </div>
                  </div>
                )}
              </div>

              {/* Danmaku bar */}
              <DanmakuBar fileId={fileId} danmakuCount={mergedDanmakuComments.length} />

              {/* Mobile only: sidebar content */}
              <div className="lg:hidden mt-4">
                <EpisodeSidebar
                  episodes={mergedEpisodes}
                  currentSort={currentEpisode?.sort}
                  onSelectEpisode={handleSelectEpisode}
                  danmakuComments={mergedDanmakuComments}
                  onSeekDanmaku={handleSeekDanmaku}
                  episodeId={episodeId}
                  animeName={animeDetail?.title ?? animeDetail?.title_original ?? ''}
                  episodeNumber={currentEpisode?.sort}
                  onExternalDanmakuImported={() => refetchImported()}
                />
                <RelatedAnimeList relations={animeDetail.relations} />
              </div>

              {/* Anime info + comments live inside the left column so the
                  right sidebar runs the full height of the page */}
              <AnimeInfoSection anime={animeDetail} />
              <BangumiComments comments={commentsData} isLoading={commentsLoading} />
            </div>

            {/* RIGHT SIDEBAR — hidden in theater mode for YouTube-wide layout */}
            <div className={cn('hidden w-[480px] shrink-0', !theaterMode && 'lg:block')}>
              <div className="sticky top-4">
                <EpisodeSidebar
                  episodes={mergedEpisodes}
                  currentSort={currentEpisode?.sort}
                  onSelectEpisode={handleSelectEpisode}
                  danmakuComments={mergedDanmakuComments}
                  onSeekDanmaku={handleSeekDanmaku}
                  episodeId={episodeId}
                  animeName={animeDetail?.title ?? animeDetail?.title_original ?? ''}
                  episodeNumber={currentEpisode?.sort}
                  onExternalDanmakuImported={() => refetchImported()}
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
