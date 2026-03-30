# Bilibili-Style Watch Page Revamp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revamp the WatchPage to Bilibili's layout — anime title above player, episode title overlay, episode grid + danmaku list in tabbed right sidebar, danmaku input bar, anime info, Bangumi comments, related recommendations, and tech info in a player gear popover.

**Architecture:** Route changes from `/watch/$fileId` to `/watch/$animeId`. Page fetches anime detail + playable episodes to get full context. Episode selection is within-page via `?ep=N` query param. Existing VideoPlayer, DanmakuOverlay, and streaming logic are preserved — the revamp is purely layout/UI.

**Tech Stack:** React 19, TanStack Router, TanStack Query, Motion, Tailwind CSS v4, Lingui v5, @videojs/react, Zustand

**Spec:** `docs/superpowers/specs/2026-03-30-bilibili-watch-page-design.md`

---

## File Structure

### New Files
- `web/src/routes/watch.$animeId.tsx` — new route definition
- `web/src/pages/WatchPage.tsx` — full rewrite (same path, new content)
- `web/src/components/watch/WatchTitleBar.tsx` — anime title + meta + actions above player
- `web/src/components/watch/EpisodeTitleOverlay.tsx` — in-player episode name overlay
- `web/src/components/watch/TechInfoPopover.tsx` — gear icon popover for codec/method info
- `web/src/components/watch/DanmakuBar.tsx` — danmaku input + style + settings
- `web/src/components/watch/EpisodeSidebar.tsx` — tabbed sidebar (episodes + danmaku list)
- `web/src/components/watch/EpisodeGrid.tsx` — numbered episode grid with progress colors
- `web/src/components/watch/DanmakuList.tsx` — scrollable timestamped danmaku list
- `web/src/components/watch/RelatedAnimeList.tsx` — recommendation cards
- `web/src/components/watch/AnimeInfoSection.tsx` — cover + synopsis + genres
- `web/src/components/watch/BangumiComments.tsx` — Bangumi comment list

### Modified Files
- `web/src/routes/watch.$fileId.tsx` — delete (replaced by `watch.$animeId.tsx`)
- `web/src/components/EpisodeListItem.tsx` — update Link from `/watch/$fileId` to `/watch/$animeId`
- `web/src/pages/AnimeDetailPage.tsx` — update watch links to new route
- `web/src/components/DanmakuSettings.tsx` — extract settings controls as a reusable inner component

### Unchanged Files (reused as-is)
- `web/src/components/VideoPlayer.tsx`
- `web/src/components/DanmakuOverlay.tsx`
- `web/src/lib/api/stream.ts`
- `web/src/lib/api/anime.ts`
- `web/src/lib/api/discover.ts`
- `web/src/lib/api/subtitle.ts`
- `web/src/lib/api/progress.ts`
- `web/src/store/player-store.ts`

---

## Task 1: Route Change + Skeleton WatchPage

**Files:**
- Delete: `web/src/routes/watch.$fileId.tsx`
- Create: `web/src/routes/watch.$animeId.tsx`
- Modify: `web/src/pages/WatchPage.tsx`
- Modify: `web/src/components/EpisodeListItem.tsx:211`
- Modify: `web/src/pages/AnimeDetailPage.tsx` (all `/watch/$fileId` links)

- [ ] **Step 1: Create new route file**

Create `web/src/routes/watch.$animeId.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const WatchPage = lazy(() => import('../pages/WatchPage').then((m) => ({ default: m.WatchPage })));

type WatchSearch = {
  ep?: number;
};

export const Route = createFileRoute('/watch/$animeId')({
  component: WatchPage,
  validateSearch: (search: Record<string, unknown>): WatchSearch => ({
    ep: typeof search.ep === 'number' ? search.ep : typeof search.ep === 'string' ? parseInt(search.ep, 10) || undefined : undefined,
  }),
});
```

- [ ] **Step 2: Delete old route file**

Delete `web/src/routes/watch.$fileId.tsx`.

- [ ] **Step 3: Replace WatchPage with skeleton**

Replace entire content of `web/src/pages/WatchPage.tsx` with a skeleton that:
- Reads `animeId` from `useParams`
- Reads `ep` from `useSearch`
- Fetches `discoverApi.detail(Number(animeId))` and `animeApi.playableEpisodes(Number(animeId))`
- Resolves current episode: if `ep` provided, find matching episode by `sort`; otherwise auto-select first incomplete episode
- Resolves `fileId` from selected episode's `media_file.id`
- Renders placeholder text showing: anime title, selected episode, fileId

```tsx
import { useParams, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { PageTransition } from '@/components/PageTransition';
import { Skeleton } from '@/components/Skeleton';
import { discoverApi, discoverKeys } from '@/lib/api/discover';
import { animeApi, animeKeys } from '@/lib/api/anime';
import type { PlayableEpisode } from '@/lib/api/anime';

function resolveEpisode(episodes: PlayableEpisode[], ep?: number): PlayableEpisode | undefined {
  if (ep !== undefined) {
    return episodes.find((e) => e.sort === ep);
  }
  // Find first episode with progress but not completed (resume)
  const inProgress = episodes.find(
    (e) => e.media_file && e.progress && e.progress.position_seconds > 0 && !e.progress.completed
  );
  if (inProgress) return inProgress;
  // Find first episode with no progress and a media file (start fresh)
  const fresh = episodes.find((e) => e.media_file && !e.progress);
  if (fresh) return fresh;
  // Fallback: first episode with a media file
  return episodes.find((e) => e.media_file);
}

export function WatchPage() {
  const { animeId } = useParams({ strict: false });
  const { ep } = useSearch({ strict: false }) as { ep?: number };
  const bangumiId = Number(animeId);

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

  const currentEpisode = useMemo(
    () => resolveEpisode(episodesData?.episodes ?? [], ep),
    [episodesData, ep]
  );

  const fileId = currentEpisode?.media_file?.id ?? null;

  if (detailLoading || episodesLoading) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-black/20 p-6">
          <Skeleton className="h-8 w-1/3 mb-4" />
          <Skeleton className="aspect-video w-full mb-4" />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-black/20 p-6">
        <p className="text-white">Anime: {animeDetail?.title}</p>
        <p className="text-white/60">Episode: {currentEpisode?.sort} — {currentEpisode?.title}</p>
        <p className="text-white/40">FileId: {fileId}</p>
      </div>
    </PageTransition>
  );
}
```

- [ ] **Step 4: Update EpisodeListItem link**

In `web/src/components/EpisodeListItem.tsx`, the component needs `bangumiId` and `episodeSort` instead of `fileId`. Update the props and link:

Change props interface — replace `fileId?: string` with:
```tsx
  bangumiId?: number;     // anime bangumi ID for /watch/:animeId navigation
  episodeSort?: number;   // episode sort number for ?ep= param
```

Update the Link at line ~211 from:
```tsx
<Link to="/watch/$fileId" params={{ fileId }} className={wrapperClassName}>
```
to:
```tsx
<Link
  to="/watch/$animeId"
  params={{ animeId: String(bangumiId) }}
  search={{ ep: episodeSort }}
  className={wrapperClassName}
>
```

Update the condition from `fileId ?` to `bangumiId ?`.

- [ ] **Step 5: Update AnimeDetailPage**

In `web/src/pages/AnimeDetailPage.tsx`, find where `EpisodeListItem` is rendered and update the props. Search for `fileId={` usage in the episode list mapping and change to pass `bangumiId` and `episodeSort` instead.

The component currently passes `fileId={ep.media_file?.id}`. Change to:
```tsx
bangumiId={bangumiId}
episodeSort={ep.sort}
```

Where `bangumiId` is the numeric anime ID from `useParams`.

- [ ] **Step 6: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`
Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add -A web/src/routes/ web/src/pages/WatchPage.tsx web/src/components/EpisodeListItem.tsx web/src/pages/AnimeDetailPage.tsx
git commit -m "refactor: change watch route from fileId to animeId with episode auto-select"
```

---

## Task 2: WatchTitleBar Component

**Files:**
- Create: `web/src/components/watch/WatchTitleBar.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import type { AnimeDetail } from '@/lib/api/discover';
import type { PlayableEpisodesResponse } from '@/lib/api/anime';
import { animeApi, animeKeys } from '@/lib/api/anime';
import { collectionApi, collectionKeys } from '@/lib/api/collection';
import { cn } from '@/lib/utils';

interface WatchTitleBarProps {
  anime: AnimeDetail;
  episodesData: PlayableEpisodesResponse;
  bangumiId: number;
}

export function WatchTitleBar({ anime, episodesData, bangumiId }: WatchTitleBarProps) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const year = anime.air_date ? new Date(anime.air_date).getFullYear() : null;
  const isInCollection = episodesData.watch_status !== '' && episodesData.watch_status !== 'none';
  const userScore = episodesData.user_score;

  const scoreMutation = useMutation({
    mutationFn: (score: number) => animeApi.updateScore(bangumiId, score),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: animeKeys.playableEpisodes(bangumiId) }),
  });

  const collectionMutation = useMutation({
    mutationFn: () =>
      collectionApi.updateStatus(bangumiId, isInCollection ? 'none' : 'watching'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.playableEpisodes(bangumiId) });
      queryClient.invalidateQueries({ queryKey: collectionKeys.all });
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start justify-between gap-4 px-1 mb-2"
    >
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-white truncate">{anime.title}</h1>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-white/40">
          {year && <span>{year}</span>}
          {year && <span>·</span>}
          <span>{anime.episode_count} {i18n._(msg`watch.episodes`)}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 text-xs">
        {/* Score */}
        <button
          type="button"
          onClick={() => {
            const score = prompt(i18n._(msg`watch.scorePrompt`), String(userScore ?? ''));
            if (score !== null) {
              const num = parseInt(score, 10);
              if (num >= 1 && num <= 10) scoreMutation.mutate(num);
            }
          }}
          className="flex items-center gap-1 text-white/50 hover:text-amber-400 transition-colors"
        >
          <span className={cn('text-sm', userScore ? 'text-amber-400' : '')}>★</span>
          <span>{userScore ?? i18n._(msg`watch.rate`)}</span>
        </button>

        {/* Collection toggle */}
        <button
          type="button"
          onClick={() => collectionMutation.mutate()}
          className={cn(
            'flex items-center gap-1 transition-colors',
            isInCollection ? 'text-red-400' : 'text-white/50 hover:text-red-400'
          )}
        >
          <span className="text-sm">{isInCollection ? '❤' : '♡'}</span>
          <span>{isInCollection ? i18n._(msg`watch.collected`) : i18n._(msg`watch.collect`)}</span>
        </button>

        {/* Share */}
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(window.location.href)}
          className="flex items-center gap-1 text-white/50 hover:text-white/80 transition-colors"
        >
          <span className="text-sm">📤</span>
          <span>{i18n._(msg`watch.share`)}</span>
        </button>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`

- [ ] **Step 3: Commit**

```bash
git add web/src/components/watch/WatchTitleBar.tsx
git commit -m "feat(watch): add WatchTitleBar component with score, collection, share"
```

---

## Task 3: EpisodeTitleOverlay + TechInfoPopover

**Files:**
- Create: `web/src/components/watch/EpisodeTitleOverlay.tsx`
- Create: `web/src/components/watch/TechInfoPopover.tsx`

- [ ] **Step 1: Create EpisodeTitleOverlay**

```tsx
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { PlayableEpisode } from '@/lib/api/anime';

interface EpisodeTitleOverlayProps {
  episode: PlayableEpisode | undefined;
}

export function EpisodeTitleOverlay({ episode }: EpisodeTitleOverlayProps) {
  const [visible, setVisible] = useState(true);

  // Show on episode change, auto-hide after 4s
  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [episode?.episode_id]);

  if (!episode) return null;

  const label = episode.title
    ? `第 ${episode.sort} 集 — ${episode.title}`
    : `第 ${episode.sort} 集`;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="absolute top-3 left-3 z-10 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-md"
        >
          <span className="text-sm text-white/90">{label}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Create TechInfoPopover**

```tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { MediaInfo } from '@/lib/api/stream';
import type { SubtitleFile } from '@/lib/api/subtitle';
import { cn } from '@/lib/utils';

interface TechInfoPopoverProps {
  mediaInfo: MediaInfo | undefined;
  subtitles: SubtitleFile[] | undefined;
  transcodeStatus: string;
}

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

export function TechInfoPopover({ mediaInfo, subtitles, transcodeStatus }: TechInfoPopoverProps) {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute bottom-3 right-3 z-20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-1 text-[11px] rounded bg-white/15 text-white/70 hover:bg-white/25 transition-colors"
      >
        ⚙
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              className="absolute bottom-full right-0 mb-2 z-40 w-64 rounded-lg border border-white/10 bg-black/90 backdrop-blur-md p-3 space-y-3"
            >
              {mediaInfo ? (
                <>
                  {/* File info */}
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">
                      {i18n._(msg`watch.playbackInfo`)}
                    </h4>
                    <p className="text-xs text-white/70 truncate">{mediaInfo.filename}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-white/40">
                      {mediaInfo.width && mediaInfo.height && (
                        <span>{mediaInfo.width}×{mediaInfo.height}</span>
                      )}
                      {mediaInfo.video_codec && <span>{mediaInfo.video_codec.toUpperCase()}</span>}
                      {mediaInfo.audio_codec && <span>{mediaInfo.audio_codec.toUpperCase()}</span>}
                      <span>{formatBytes(mediaInfo.size_bytes)}</span>
                      {mediaInfo.duration_seconds && (
                        <span>{formatDuration(mediaInfo.duration_seconds)}</span>
                      )}
                    </div>
                  </div>

                  {/* Playback method */}
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">
                      {i18n._(msg`watch.playbackMethod`)}
                    </h4>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-white/50">{i18n._(msg`watch.directStream`)}</span>
                        <span className={mediaInfo.can_direct_play ? 'text-green-400' : 'text-red-400/60'}>
                          {mediaInfo.can_direct_play ? '✓' : '✗'}
                        </span>
                      </div>
                      {mediaInfo.can_remux && (
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-white/50">Remux</span>
                          <span className="text-green-400">✓</span>
                        </div>
                      )}
                      {mediaInfo.needs_transcode && (
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-white/50">{i18n._(msg`watch.transcode`)}</span>
                          <span className={cn(
                            transcodeStatus === 'ready' ? 'text-green-400' :
                            transcodeStatus === 'error' ? 'text-red-400' : 'text-amber-400'
                          )}>
                            {transcodeStatus === 'ready' ? '✓' : transcodeStatus === 'error' ? '✗' : '⏳'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Subtitles */}
                  {subtitles && subtitles.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">
                        {i18n._(msg`watch.subtitle`)}
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {subtitles.map((sub) => (
                          <span key={sub.id} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-white/50">
                            {sub.language}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-white/30">Loading...</div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`

- [ ] **Step 4: Commit**

```bash
git add web/src/components/watch/EpisodeTitleOverlay.tsx web/src/components/watch/TechInfoPopover.tsx
git commit -m "feat(watch): add EpisodeTitleOverlay and TechInfoPopover components"
```

---

## Task 4: DanmakuBar Component

**Files:**
- Create: `web/src/components/watch/DanmakuBar.tsx`
- Modify: `web/src/components/DanmakuSettings.tsx` — extract inner controls

- [ ] **Step 1: Extract DanmakuSettings controls**

In `web/src/components/DanmakuSettings.tsx`, export the inner settings panel content as `DanmakuSettingsControls` (the part inside the motion.div). Keep the existing `DanmakuSettings` component intact for backward compatibility.

Add a new export at the bottom of the file:

```tsx
/** Standalone settings controls without positioning wrapper — for use in DanmakuBar popover */
export function DanmakuSettingsControls() {
  const { i18n } = useLingui();
  const enabled = usePlayerStore((s) => s.danmakuEnabled);
  const opacity = usePlayerStore((s) => s.danmakuOpacity);
  const fontSize = usePlayerStore((s) => s.danmakuFontSize);
  const speed = usePlayerStore((s) => s.danmakuSpeed);
  const toggleDanmaku = usePlayerStore((s) => s.toggleDanmaku);
  const setOpacity = usePlayerStore((s) => s.setDanmakuOpacity);
  const setFontSize = usePlayerStore((s) => s.setDanmakuFontSize);
  const setSpeed = usePlayerStore((s) => s.setDanmakuSpeed);

  return (
    <div className="space-y-3">
      {/* On/Off */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-mm-text-secondary">{i18n._(msg`watch.danmaku`)}</span>
        <button
          type="button"
          onClick={toggleDanmaku}
          className={cn(
            'px-2 py-0.5 text-[10px] font-medium rounded',
            enabled ? 'bg-mm-accent text-black' : 'bg-mm-surface text-mm-text-muted'
          )}
        >
          {enabled ? 'ON' : 'OFF'}
        </button>
      </div>
      {/* Opacity */}
      <label className="block">
        <span className="text-[10px] text-mm-text-muted block mb-1">{i18n._(msg`watch.danmaku.opacity`)}</span>
        <input type="range" min={0} max={1} step={0.1} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full h-1 accent-mm-accent" />
      </label>
      {/* Font size */}
      <div>
        <span className="text-[10px] text-mm-text-muted block mb-1">{i18n._(msg`watch.danmaku.fontSize`)}</span>
        <div className="flex gap-1">
          {FONT_SIZES.map((s) => (
            <button type="button" key={s} onClick={() => setFontSize(s)} className={cn('flex-1 py-0.5 text-[10px] rounded transition-colors', fontSize === s ? 'bg-mm-accent text-black' : 'bg-mm-surface text-mm-text-secondary')}>
              {s}
            </button>
          ))}
        </div>
      </div>
      {/* Speed */}
      <div>
        <span className="text-[10px] text-mm-text-muted block mb-1">{i18n._(msg`watch.danmaku.speed`)}</span>
        <div className="flex gap-1">
          {[
            { label: i18n._(msg`watch.danmaku.slow`), value: 100 },
            { label: i18n._(msg`watch.danmaku.normal`), value: 144 },
            { label: i18n._(msg`watch.danmaku.fast`), value: 200 },
          ].map((s) => (
            <button type="button" key={s.value} onClick={() => setSpeed(s.value)} className={cn('flex-1 py-0.5 text-[10px] rounded transition-colors', speed === s.value ? 'bg-mm-accent text-black' : 'bg-mm-surface text-mm-text-secondary')}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create DanmakuBar**

```tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { DanmakuSettingsControls } from '@/components/DanmakuSettings';

interface DanmakuBarProps {
  fileId: string | null;
  danmakuCount: number;
}

export function DanmakuBar({ fileId, danmakuCount }: DanmakuBarProps) {
  const { i18n } = useLingui();
  const [text, setText] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!text.trim() || !fileId || sending) return;
    setSending(true);
    try {
      await fetch(
        `${import.meta.env.VITE_API_URL ?? 'http://localhost:8080'}/api/v1/danmaku/${fileId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('milmil-token') ?? ''}`,
          },
          body: JSON.stringify({ text: text.trim() }),
        }
      );
      setText('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <span className="text-[11px] text-white/30 shrink-0">
        {i18n._(msg`watch.danmaku`)} ({danmakuCount})
      </span>

      <div className="flex-1 flex items-center gap-1.5">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={i18n._(msg`watch.danmaku.placeholder`)}
          disabled={!fileId}
          className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded px-2.5 py-1 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors disabled:opacity-30"
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim() || !fileId || sending}
          className="px-2.5 py-1 text-[11px] rounded bg-mm-accent/80 text-black font-medium hover:bg-mm-accent transition-colors disabled:opacity-30"
        >
          {i18n._(msg`watch.danmaku.send`)}
        </button>
      </div>

      {/* Settings toggle */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="px-1.5 py-1 text-[11px] rounded bg-white/[0.04] text-white/40 hover:text-white/60 transition-colors"
        >
          ⚙
        </button>

        <AnimatePresence>
          {settingsOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setSettingsOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.96 }}
                transition={{ duration: 0.12 }}
                className="absolute bottom-full right-0 mb-2 z-40 w-52 rounded-lg border border-mm-border bg-mm-bg p-3"
              >
                <DanmakuSettingsControls />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`

- [ ] **Step 4: Commit**

```bash
git add web/src/components/watch/DanmakuBar.tsx web/src/components/DanmakuSettings.tsx
git commit -m "feat(watch): add DanmakuBar with input, send, and settings popover"
```

---

## Task 5: EpisodeSidebar (Tabs + EpisodeGrid + DanmakuList)

**Files:**
- Create: `web/src/components/watch/EpisodeGrid.tsx`
- Create: `web/src/components/watch/DanmakuList.tsx`
- Create: `web/src/components/watch/EpisodeSidebar.tsx`

- [ ] **Step 1: Create EpisodeGrid**

```tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useState } from 'react';
import type { PlayableEpisode } from '@/lib/api/anime';
import { cn } from '@/lib/utils';

interface EpisodeGridProps {
  episodes: PlayableEpisode[];
  currentSort: number | undefined;
  onSelectEpisode: (sort: number) => void;
}

const PAGE_SIZE = 24;

export function EpisodeGrid({ episodes, currentSort, onSelectEpisode }: EpisodeGridProps) {
  const { i18n } = useLingui();
  const totalPages = Math.ceil(episodes.length / PAGE_SIZE);
  const [page, setPage] = useState(() => {
    if (currentSort === undefined) return 0;
    const idx = episodes.findIndex((e) => e.sort === currentSort);
    return idx >= 0 ? Math.floor(idx / PAGE_SIZE) : 0;
  });

  const pageEpisodes = episodes.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const rangeStart = page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, episodes.length);

  return (
    <div>
      {/* Page selector */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mb-2">
          <select
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
            className="text-[11px] bg-white/[0.04] border border-white/[0.08] rounded px-1.5 py-0.5 text-white/60"
          >
            {Array.from({ length: totalPages }, (_, i) => (
              <option key={i} value={i}>
                {i * PAGE_SIZE + 1}-{Math.min((i + 1) * PAGE_SIZE, episodes.length)}
              </option>
            ))}
          </select>
        </div>
      )}

      {totalPages <= 1 && (
        <div className="text-[11px] text-white/35 mb-2">{rangeStart}-{rangeEnd} {i18n._(msg`watch.episodes`)}</div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {pageEpisodes.map((ep) => {
          const isCurrent = ep.sort === currentSort;
          const hasFile = !!ep.media_file;
          const completed = ep.progress?.completed;
          const inProgress = ep.progress && ep.progress.position_seconds > 0 && !completed;

          return (
            <button
              type="button"
              key={ep.episode_id}
              disabled={!hasFile}
              onClick={() => hasFile && onSelectEpisode(ep.sort)}
              className={cn(
                'py-1.5 text-xs rounded text-center transition-all',
                !hasFile && 'opacity-25 cursor-not-allowed',
                isCurrent && 'bg-blue-500/20 border border-blue-400/50 text-blue-300 font-bold',
                !isCurrent && completed && 'bg-green-500/12 text-white/50',
                !isCurrent && inProgress && 'bg-amber-500/12 text-white/50',
                !isCurrent && !completed && !inProgress && hasFile && 'bg-white/[0.05] text-white/40 hover:bg-white/[0.08]'
              )}
            >
              {ep.sort}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 text-[10px] text-white/30">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-green-500/40" /> {i18n._(msg`watch.completed`)}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-amber-500/40" /> {i18n._(msg`watch.inProgress`)}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-blue-500/40" /> {i18n._(msg`watch.playing`)}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create DanmakuList**

```tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import type { DanmakuComment } from '@/lib/api/stream';

interface DanmakuListProps {
  comments: DanmakuComment[];
  onSeek: (time: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function DanmakuList({ comments, onSeek }: DanmakuListProps) {
  const { i18n } = useLingui();
  const sorted = [...comments].sort((a, b) => a.time - b.time);

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-white/30">
        {i18n._(msg`watch.danmaku.noData`)}
      </div>
    );
  }

  return (
    <div className="max-h-[400px] overflow-y-auto space-y-0.5">
      {sorted.map((c, i) => (
        <button
          type="button"
          key={`${c.time}-${i}`}
          onClick={() => onSeek(c.time)}
          className="w-full flex items-center gap-2 px-2 py-1 rounded text-left hover:bg-white/[0.04] transition-colors group"
        >
          <span className="text-[10px] text-white/30 tabular-nums shrink-0 group-hover:text-blue-400">
            {formatTime(c.time)}
          </span>
          <span className="text-[11px] text-white/50 truncate group-hover:text-white/70">
            {c.text}
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create EpisodeSidebar**

```tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useState } from 'react';
import type { PlayableEpisode } from '@/lib/api/anime';
import type { DanmakuComment } from '@/lib/api/stream';
import { DanmakuList } from './DanmakuList';
import { EpisodeGrid } from './EpisodeGrid';
import { cn } from '@/lib/utils';

type Tab = 'episodes' | 'danmaku';

interface EpisodeSidebarProps {
  episodes: PlayableEpisode[];
  currentSort: number | undefined;
  onSelectEpisode: (sort: number) => void;
  danmakuComments: DanmakuComment[];
  onSeekDanmaku: (time: number) => void;
}

export function EpisodeSidebar({
  episodes,
  currentSort,
  onSelectEpisode,
  danmakuComments,
  onSeekDanmaku,
}: EpisodeSidebarProps) {
  const { i18n } = useLingui();
  const [tab, setTab] = useState<Tab>('episodes');

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'episodes', label: i18n._(msg`watch.episodes`) },
    { key: 'danmaku', label: i18n._(msg`watch.danmaku`), badge: danmakuComments.length || undefined },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-white/[0.08] mb-3">
        {tabs.map((t) => (
          <button
            type="button"
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 pb-2 text-xs font-medium text-center transition-colors relative',
              tab === t.key ? 'text-blue-400' : 'text-white/40 hover:text-white/60'
            )}
          >
            {t.label}
            {t.badge !== undefined && (
              <span className="ml-1 text-[10px] text-white/30">({t.badge})</span>
            )}
            {tab === t.key && (
              <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-blue-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'episodes' && (
        <EpisodeGrid
          episodes={episodes}
          currentSort={currentSort}
          onSelectEpisode={onSelectEpisode}
        />
      )}
      {tab === 'danmaku' && (
        <DanmakuList comments={danmakuComments} onSeek={onSeekDanmaku} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`

- [ ] **Step 5: Commit**

```bash
git add web/src/components/watch/EpisodeGrid.tsx web/src/components/watch/DanmakuList.tsx web/src/components/watch/EpisodeSidebar.tsx
git commit -m "feat(watch): add EpisodeSidebar with tabbed episode grid and danmaku list"
```

---

## Task 6: AnimeInfoSection + BangumiComments + RelatedAnimeList

**Files:**
- Create: `web/src/components/watch/AnimeInfoSection.tsx`
- Create: `web/src/components/watch/BangumiComments.tsx`
- Create: `web/src/components/watch/RelatedAnimeList.tsx`

- [ ] **Step 1: Create AnimeInfoSection**

```tsx
import type { AnimeDetail } from '@/lib/api/discover';

interface AnimeInfoSectionProps {
  anime: AnimeDetail;
}

export function AnimeInfoSection({ anime }: AnimeInfoSectionProps) {
  return (
    <div className="mt-4 p-3 bg-white/[0.03] rounded-lg">
      <div className="flex gap-3">
        {anime.cover_image && (
          <img
            src={anime.cover_image}
            alt=""
            className="w-14 h-20 rounded object-cover shrink-0"
          />
        )}
        <div className="min-w-0">
          {anime.synopsis && (
            <p className="text-xs text-white/50 line-clamp-4 leading-relaxed">
              {anime.synopsis.replace(/<[^>]+>/g, '')}
            </p>
          )}
          {anime.genres && anime.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {anime.genres.map((g) => (
                <span key={g} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-white/40">
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create BangumiComments**

```tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useState } from 'react';
import type { BangumiComment } from '@/lib/api/discover';

interface BangumiCommentsProps {
  comments: BangumiComment[] | undefined;
  isLoading: boolean;
}

const INITIAL_COUNT = 5;

export function BangumiComments({ comments, isLoading }: BangumiCommentsProps) {
  const { i18n } = useLingui();
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="mt-4">
        <div className="h-4 w-16 bg-white/[0.06] rounded animate-pulse mb-3" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-white/[0.06] animate-pulse shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3 w-20 bg-white/[0.06] rounded animate-pulse" />
                <div className="h-3 w-full bg-white/[0.06] rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!comments || comments.length === 0) return null;

  const visible = expanded ? comments : comments.slice(0, INITIAL_COUNT);

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-white/70 mb-3">
        {i18n._(msg`watch.comments`)} ({comments.length})
      </h3>

      <div className="space-y-3">
        {visible.map((c) => (
          <div key={c.id} className="flex gap-2">
            {c.avatar ? (
              <img src={c.avatar} alt="" className="w-7 h-7 rounded-full shrink-0 object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-white/[0.08] shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-[11px] text-white/50">
                {c.nickname || c.username}
                {c.rate > 0 && (
                  <span className="ml-1.5 text-amber-400">★ {c.rate}</span>
                )}
              </div>
              <p className="text-xs text-white/40 mt-0.5 line-clamp-3 leading-relaxed">
                {c.comment}
              </p>
            </div>
          </div>
        ))}
      </div>

      {comments.length > INITIAL_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs text-white/30 hover:text-white/50 transition-colors w-full text-center py-1"
        >
          {expanded ? i18n._(msg`watch.showLess`) : i18n._(msg`watch.showMore`)}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create RelatedAnimeList**

```tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Link } from '@tanstack/react-router';
import type { RelatedAnime } from '@/lib/api/discover';

interface RelatedAnimeListProps {
  relations: RelatedAnime[] | undefined;
}

const RELATION_LABELS: Record<string, Record<string, string>> = {
  PREQUEL: { en: 'Prequel', 'zh-Hant': '前作', 'zh-Hans': '前作' },
  SEQUEL: { en: 'Sequel', 'zh-Hant': '續作', 'zh-Hans': '续作' },
  SIDE_STORY: { en: 'Side Story', 'zh-Hant': '番外篇', 'zh-Hans': '番外篇' },
  PARENT: { en: 'Parent', 'zh-Hant': '本篇', 'zh-Hans': '本篇' },
  ALTERNATIVE: { en: 'Alternative', 'zh-Hant': '替代版', 'zh-Hans': '替代版' },
  SPIN_OFF: { en: 'Spin-off', 'zh-Hant': '衍生作', 'zh-Hans': '衍生作' },
};

function getRelationLabel(type: string, locale: string): string {
  return RELATION_LABELS[type]?.[locale] ?? RELATION_LABELS[type]?.en ?? type.replace(/_/g, ' ');
}

const MAX_ITEMS = 5;

export function RelatedAnimeList({ relations }: RelatedAnimeListProps) {
  const { i18n } = useLingui();

  if (!relations || relations.length === 0) return null;

  const items = relations.slice(0, MAX_ITEMS);

  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold text-white/60 mb-2">
        {i18n._(msg`watch.related`)}
      </h3>
      <div className="space-y-2">
        {items.map((r) => (
          <Link
            key={r.anime.bangumi_id}
            to="/watch/$animeId"
            params={{ animeId: String(r.anime.bangumi_id) }}
            className="flex gap-2 rounded p-1 hover:bg-white/[0.04] transition-colors group"
          >
            {r.anime.cover_image ? (
              <img
                src={r.anime.cover_image}
                alt=""
                className="w-16 h-10 rounded object-cover shrink-0"
              />
            ) : (
              <div className="w-16 h-10 rounded bg-white/[0.06] shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-[11px] text-white/60 line-clamp-2 leading-tight group-hover:text-white/80">
                {r.anime.title}
              </p>
              <p className="text-[10px] text-white/30 mt-0.5">
                {getRelationLabel(r.relation_type, i18n.locale)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`

- [ ] **Step 5: Commit**

```bash
git add web/src/components/watch/AnimeInfoSection.tsx web/src/components/watch/BangumiComments.tsx web/src/components/watch/RelatedAnimeList.tsx
git commit -m "feat(watch): add AnimeInfoSection, BangumiComments, RelatedAnimeList"
```

---

## Task 7: Assemble Full WatchPage

**Files:**
- Modify: `web/src/pages/WatchPage.tsx` — replace skeleton with full implementation

- [ ] **Step 1: Write the full WatchPage**

Replace the entire content of `web/src/pages/WatchPage.tsx` with the full assembly. This is the largest step — it wires all components together.

```tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VideoPlayerAPI } from '@/components/VideoPlayer';
import { DanmakuOverlay } from '@/components/DanmakuOverlay';
import { PageTransition } from '@/components/PageTransition';
import { Skeleton } from '@/components/Skeleton';
import { VideoPlayer } from '@/components/VideoPlayer';
import { AnimeInfoSection } from '@/components/watch/AnimeInfoSection';
import { BangumiComments } from '@/components/watch/BangumiComments';
import { DanmakuBar } from '@/components/watch/DanmakuBar';
import { EpisodeSidebar } from '@/components/watch/EpisodeSidebar';
import { EpisodeTitleOverlay } from '@/components/watch/EpisodeTitleOverlay';
import { RelatedAnimeList } from '@/components/watch/RelatedAnimeList';
import { TechInfoPopover } from '@/components/watch/TechInfoPopover';
import { WatchTitleBar } from '@/components/watch/WatchTitleBar';
import { animeApi, animeKeys } from '@/lib/api/anime';
import type { PlayableEpisode } from '@/lib/api/anime';
import { discoverApi, discoverKeys } from '@/lib/api/discover';
import { progressApi, progressKeys } from '@/lib/api/progress';
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

const SAVE_INTERVAL_MS = 10_000;
const COMPLETION_THRESHOLD_SECONDS = 30;

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

type TranscodeStatus = 'idle' | 'starting' | 'transcoding' | 'ready' | 'error';

export function WatchPage() {
  const { i18n } = useLingui();
  const { animeId } = useParams({ strict: false });
  const { ep } = useSearch({ strict: false }) as { ep?: number };
  const navigate = useNavigate();
  const bangumiId = Number(animeId);
  const queryClient = useQueryClient();

  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const danmakuOpacity = usePlayerStore((s) => s.danmakuOpacity);
  const danmakuFontSize = usePlayerStore((s) => s.danmakuFontSize);

  const playerRef = useRef<VideoPlayerAPI | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Transcode state
  const [transcodeToken, setTranscodeToken] = useState<string | null>(null);
  const [transcodeStatus, setTranscodeStatus] = useState<TranscodeStatus>('idle');

  // ── Data queries ──
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

  const { data: bangumiComments, isLoading: commentsLoading } = useQuery({
    queryKey: discoverKeys.comments(bangumiId),
    queryFn: () => discoverApi.comments(bangumiId),
    enabled: !Number.isNaN(bangumiId),
  });

  // ── Episode resolution ──
  const currentEpisode = useMemo(
    () => resolveEpisode(episodesData?.episodes ?? [], ep),
    [episodesData, ep]
  );
  const fileId = currentEpisode?.media_file?.id ?? null;

  // ── File-dependent queries ──
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
      return res.json() as Promise<{ count: number; comments: { p: string; m: string }[] }>;
    },
    enabled: !!fileId,
  });

  const { data: subtitles } = useQuery({
    queryKey: ['subtitles', fileId],
    queryFn: () => subtitleApi.list(fileId!),
    enabled: !!fileId,
  });

  // ── Transcode logic ──
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

  // ── Stream URL ──
  const streamUrl = useMemo(() => {
    if (!fileId) return '';
    if (mediaInfo?.can_direct_play) return getStreamUrl(fileId);
    if (mediaInfo?.can_remux) return getRemuxUrl(fileId);
    if (transcodeStatus === 'ready' && transcodeToken) return getHLSUrl(transcodeToken);
    return '';
  }, [fileId, mediaInfo, transcodeStatus, transcodeToken]);

  const mimeType = useMemo(() => {
    if (transcodeStatus === 'ready') return 'application/x-mpegURL';
    return getMimeType(mediaInfo?.filename ?? 'video.mp4');
  }, [transcodeStatus, mediaInfo]);

  const comments: DanmakuComment[] = danmakuData?.comments
    ? parseDandanplayComments(danmakuData.comments, danmakuFontSize, danmakuOpacity)
    : [];

  // ── Progress saving ──
  const saveProgress = useCallback(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed() || !fileId || !currentEpisode) return;
    const position = Math.floor(player.currentTime?.() ?? 0);
    const duration = Math.floor(player.duration?.() ?? 0);
    if (position <= 0) return;
    const completed = duration > 0 && position >= duration - COMPLETION_THRESHOLD_SECONDS;
    progressApi
      .save({
        media_file_id: fileId,
        episode_id: currentEpisode.episode_id,
        position_seconds: position,
        duration_seconds: duration,
        completed,
      })
      .catch(() => {});
  }, [fileId, currentEpisode]);

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

  // ── Player ready ──
  const handlePlayerReady = (api: VideoPlayerAPI) => {
    setVideoEl(api.videoElement());
    playerRef.current = api;

    if (currentEpisode?.progress && currentEpisode.progress.position_seconds > 0 && !currentEpisode.progress.completed) {
      api.currentTime(currentEpisode.progress.position_seconds);
    }

    if (subtitles?.length) {
      for (const sub of subtitles) {
        api.addRemoteTextTrack(
          { kind: 'subtitles', src: getSubtitleUrl(sub.id), srclang: sub.language, label: sub.language },
          false
        );
      }
    }

    api.on('play', () => startSaveInterval());
    api.on('pause', () => { stopSaveInterval(); saveProgress(); });
    api.on('ended', () => { stopSaveInterval(); saveProgress(); });
  };

  // ── Episode switching ──
  const handleSelectEpisode = (sort: number) => {
    saveProgress();
    stopSaveInterval();
    setTranscodeStatus('idle');
    setTranscodeToken(null);
    navigate({
      to: '/watch/$animeId',
      params: { animeId: String(bangumiId) },
      search: { ep: sort },
      replace: true,
    });
  };

  const handleSeekDanmaku = (time: number) => {
    playerRef.current?.currentTime(time);
  };

  // ── Loading state ──
  if (detailLoading || episodesLoading) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-black/20 p-4 lg:p-6">
          <Skeleton className="h-8 w-1/3 mb-3" />
          <div className="flex gap-3">
            <Skeleton className="flex-1 aspect-video" />
            <Skeleton className="w-[280px] h-[400px] hidden lg:block" />
          </div>
        </div>
      </PageTransition>
    );
  }

  if (!animeDetail || !episodesData) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-black/20 flex items-center justify-center">
          <p className="text-white/40">{i18n._(msg`watch.error.notFound`)}</p>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-black/20">
        <div className="max-w-[1400px] mx-auto px-3 lg:px-6 py-3 lg:py-4">

          {/* Title bar — above player */}
          <WatchTitleBar anime={animeDetail} episodesData={episodesData} bangumiId={bangumiId} />

          {/* Main layout: player column + sidebar */}
          <div className="flex flex-col lg:flex-row gap-3">

            {/* ── Left column ── */}
            <div className="flex-1 min-w-0">
              {/* Player */}
              <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
                {streamUrl ? (
                  <>
                    <VideoPlayer src={streamUrl} type={mimeType} onReady={handlePlayerReady} className="w-full h-full" />
                    <DanmakuOverlay videoElement={videoEl} comments={comments} />
                    <EpisodeTitleOverlay episode={currentEpisode} />
                    <TechInfoPopover mediaInfo={mediaInfo} subtitles={subtitles} transcodeStatus={transcodeStatus} />
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                      <span className="text-sm text-white/40">Loading...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Danmaku bar */}
              <DanmakuBar fileId={fileId} danmakuCount={danmakuData?.count ?? 0} />

              {/* Mobile only: episode grid + sidebar content */}
              <div className="lg:hidden mt-4">
                <EpisodeSidebar
                  episodes={episodesData.episodes}
                  currentSort={currentEpisode?.sort}
                  onSelectEpisode={handleSelectEpisode}
                  danmakuComments={comments}
                  onSeekDanmaku={handleSeekDanmaku}
                />
                <RelatedAnimeList relations={animeDetail.relations} />
              </div>

              {/* Anime info */}
              <AnimeInfoSection anime={animeDetail} />

              {/* Bangumi comments */}
              <BangumiComments comments={bangumiComments} isLoading={commentsLoading} />
            </div>

            {/* ── Right sidebar (desktop only) ── */}
            <aside className="hidden lg:block w-[280px] shrink-0">
              <div className="sticky top-4">
                <EpisodeSidebar
                  episodes={episodesData.episodes}
                  currentSort={currentEpisode?.sort}
                  onSelectEpisode={handleSelectEpisode}
                  danmakuComments={comments}
                  onSeekDanmaku={handleSeekDanmaku}
                />
                <RelatedAnimeList relations={animeDetail.relations} />
              </div>
            </aside>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/WatchPage.tsx
git commit -m "feat(watch): assemble full Bilibili-style WatchPage with all components"
```

---

## Task 8: i18n Strings + Final Cleanup

**Files:**
- Modify: `web/src/locales/en/messages.po`
- Modify: `web/src/locales/zh-Hant/messages.po`
- Modify: `web/src/locales/zh-Hans/messages.po`

- [ ] **Step 1: Add new i18n message keys**

Run `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run i18n:extract` to find all new `msg\`` keys.

Then fill in translations for these new keys across all three locale files:

| Key | en | zh-Hant | zh-Hans |
|---|---|---|---|
| `watch.episodes` | Episodes | 集 | 集 |
| `watch.rate` | Rate | 評分 | 评分 |
| `watch.collected` | Collected | 已收藏 | 已收藏 |
| `watch.collect` | Collect | 收藏 | 收藏 |
| `watch.share` | Share | 分享 | 分享 |
| `watch.scorePrompt` | Rate (1-10) | 評分 (1-10) | 评分 (1-10) |
| `watch.comments` | Comments | 評論 | 评论 |
| `watch.showMore` | Show more | 查看更多 | 查看更多 |
| `watch.showLess` | Show less | 收起 | 收起 |
| `watch.related` | Related | 相關推薦 | 相关推荐 |
| `watch.completed` | Watched | 已看完 | 已看完 |
| `watch.inProgress` | In progress | 看到一半 | 看到一半 |
| `watch.playing` | Playing | 正在播放 | 正在播放 |
| `watch.danmaku.placeholder` | Send danmaku... | 發送彈幕... | 发送弹幕... |
| `watch.danmaku.send` | Send | 發送 | 发送 |
| `watch.error.notFound` | Anime not found | 找不到動畫 | 找不到动画 |

- [ ] **Step 2: Compile i18n**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run i18n:compile`

- [ ] **Step 3: Full typecheck**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`

- [ ] **Step 4: Commit**

```bash
git add web/src/locales/
git commit -m "feat(watch): add i18n strings for Bilibili-style watch page"
```

---

## Summary

| Task | Description | Components |
|---|---|---|
| 1 | Route change + skeleton page | Route, WatchPage skeleton, EpisodeListItem link update |
| 2 | WatchTitleBar | Title, meta, score, collection, share |
| 3 | EpisodeTitleOverlay + TechInfoPopover | Player overlays |
| 4 | DanmakuBar | Input, send, settings popover |
| 5 | EpisodeSidebar + EpisodeGrid + DanmakuList | Tabbed right sidebar |
| 6 | AnimeInfoSection + BangumiComments + RelatedAnimeList | Below-player content |
| 7 | Assemble full WatchPage | Wire everything together |
| 8 | i18n + cleanup | Translation strings |
