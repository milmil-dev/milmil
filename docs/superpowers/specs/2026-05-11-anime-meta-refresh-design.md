# Anime Detail — Refresh Metadata Button

**Date:** 2026-05-11
**Status:** Approved, ready for implementation plan
**Scope:** Single feature — bypass-cache refresh of anime detail + episode metadata in the active locale.

## Problem

The anime detail page caches metadata aggressively. Bangumi/AniList detail and episodes are cached for 24h; TMDB-localized show and season payloads are cached per-locale for 24h. When a user changes their UI language, or upstream sources publish a translation that didn't exist at first fetch, the cached payload masks the newer/locale-correct data for up to a day. Users have no recourse short of waiting out the TTL.

The fix: a user-triggered "refresh metadata" action on the detail page that bypasses the cache and overwrites it with fresh data in the user's currently-active locale.

## Out of scope

- Refresh of recommendations / relations enrichment — low value, costs many TMDB calls.
- Refresh button on a standalone episode list view — the hero button covers it.
- Server-side rate limiting — upstream client rate limits + client-side mutation-state disable are sufficient.
- Notification-text i18n (separate bug, separate design).
- The schedule page hash-label bug — that's a stale production deploy, not code.

## User flow

1. User opens the anime detail page; data renders from cache.
2. User notices the title or synopsis is in the wrong language (or otherwise stale).
3. User clicks the refresh icon in the top-right of the hero.
4. Icon spins; button disables.
5. Backend refetches detail and episodes from upstream, overwrites caches in the user's locale, returns fresh data.
6. React Query invalidates dependent queries; page re-renders with fresh data.
7. Success toast: "Metadata refreshed" (localized).
8. On failure: error toast; no partial state — the cache write is best-effort and the user can retry.

## Frontend

### Placement

`web/src/pages/AnimeDetailPage.tsx` — the hero's existing top-right icon row already hosts Bangumi / AniList / MAL / TMDB / AniDB external link buttons. The refresh button sits at the **leftmost** position of that row, with a `mr-1.5` (6px) visual gap separating it from the external link icons — actions and external navigation read as distinct affordances.

### Visual

Same circle treatment as siblings:
- `w-8 h-8 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-sm text-white/60 hover:bg-black/60 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed`
- Icon: `RefreshIcon` from `@hugeicons/core-free-icons` (already used elsewhere in the codebase), size 14
- While in-flight: icon receives `animate-spin`, button is disabled
- `title` / tooltip: `i18n._(msg\`anime.refreshMeta\`)` — Chinese label: 「重新整理中繼資料」

### Behavior

```tsx
const refreshMeta = useMutation({
  mutationFn: async () => {
    const tasks: Promise<unknown>[] = [discoverApi.detail(detailId, { refresh: true })];
    if (!isAniListOnly && !Number.isNaN(numericId)) {
      tasks.push(discoverApi.episodes(numericId, { refresh: true }));
    }
    await Promise.all(tasks);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: discoverKeys.detail(detailId) });
    if (!isAniListOnly) {
      queryClient.invalidateQueries({ queryKey: discoverKeys.episodes(numericId) });
    }
    toast.success(i18n._(msg`anime.metaRefreshed`));
  },
  onError: (err: Error) => toast.error(err.message),
});
```

Mutation state (`refreshMeta.isPending`) drives the disabled + spinning UI.

### API client change

`web/src/lib/api/discover.ts`:

```ts
detail: (id: number | string, opts?: { refresh?: boolean }) =>
  api.get<AnimeDetail>(`/api/v1/discover/anime/${id}${opts?.refresh ? '?refresh=true' : ''}`),
episodes: (id: number, opts?: { refresh?: boolean }) =>
  api.get<Episode[]>(`/api/v1/discover/anime/${id}/episodes${opts?.refresh ? '?refresh=true' : ''}`),
```

Existing callers pass no second argument and behave unchanged.

### i18n keys to add

- `anime.refreshMeta` — tooltip/aria, "Refresh metadata" / 「重新整理中繼資料」
- `anime.metaRefreshed` — success toast, "Metadata refreshed" / 「中繼資料已重新整理」

Extract with `bun run i18n:extract`, translate in all locale `.po` files, then `bun run i18n:compile`.

## Backend

### Endpoints

- `GET /api/v1/discover/anime/:id?refresh=true`
- `GET /api/v1/discover/anime/:id/episodes?refresh=true`

`refresh=true` is the trigger; absence (the default) preserves today's cached-read behavior.

Auth: both endpoints remain public (matches existing route registration in `router.go`). Upstream client rate limits (Bangumi/AniList/TMDB) protect against spam; the client-side mutation-state disable prevents typical user-driven storms.

### Handler changes

`api/internal/api/discover_handler.go`:

- `handleAnimeDetail`: parse `refresh := c.QueryParam("refresh") == "true"`; pass it through to the service layer and the TMDB enricher.
- `handleAnimeEpisodes`: same.

### Service layer

`api/internal/metadata/service.go`:

Add a `refresh bool` parameter to:

- `GetAnimeDetail(ctx, bangumiID, refresh)`
- `GetAnimeDetailByAniList(ctx, anilistID, refresh)`
- `GetEpisodes(ctx, bangumiID, refresh)`

When `refresh=true`, the early `s.getCache(...)` return is skipped; fetched data still writes through to the cache via `s.setCache(...)`, overwriting the stale entry.

`GetEpisodes` internally reads the cached detail (`meta:bangumi:{id}`) just to discover the AniList ID for episode-image enrichment. That internal lookup stays cached even when `refresh=true` is propagated to `GetEpisodes` — the AniList ID is locale-independent, refetching it has no payoff, and `refresh=true` on `GetEpisodes` only skips the early return on the `meta:episodes:{id}` key. **Rule of thumb: `refresh` skips the cache-read at the entry point of the service method it's passed to, nothing deeper.**

### TMDB enrichment

`api/internal/api/discover_tmdb.go`:

The enrichers `enrichAnimeDetailWithTMDB` and `enrichEpisodesWithTMDB` gain a `refresh bool` parameter. When `refresh=true`:

- `fetchTMDBLocalizedShow` skips its `h.cache.Get(...)` early return and overwrites on success
- `fetchTMDBLocalizedSeason` skips its `h.cache.Get(...)` early return and overwrites on success
- `lookupTMDBID` is **unchanged** — the cross-reference (`tmdb:xref:v2:al:{id}`, `tmdb:xref:v2:bgm:{id}`) is locale-independent, stable, and re-fetching costs a TMDB search round-trip with no benefit

The synopsis fallback chain (`fetchTMDBSynopsisWithFallback`) walks multiple locales; when `refresh=true`, each locale in the chain is re-fetched (any could be the one the user is now reading).

### Cache key summary

| Key | Refreshed when `refresh=true`? | Why |
|---|---|---|
| `meta:bangumi:{id}` | Yes | User-facing detail payload |
| `meta:anilist:{id}` | Yes | AniList-only detail payload |
| `meta:episodes:{id}` | Yes | User-facing episode list |
| `tmdb:tv:v2:{tmdbID}:{locale}` | Yes (locale + fallback chain) | TMDB localized show |
| `tmdb:season:v2:{tmdbID}:{n}:{locale}` | Yes | TMDB localized season episodes |
| `tmdb:xref:v2:al:{id}` / `:bgm:{id}` | No | Locale-independent, stable |
| `meta:comments:{id}` | No | Not in scope; comments aren't localized through this path |
| `meta:franchise:*` | No | Separate query, not on the refresh path |

## Testing

**Backend unit tests** (`api/internal/metadata/service_test.go`):
- `GetAnimeDetail(ctx, id, refresh=true)` calls Bangumi (and AniList) even when the cache key is pre-populated.
- After a refreshing call, the cache key is overwritten with the fresh payload.

**Backend integration test** (handler-level): query `?refresh=true` triggers the service-level refresh path (assert via a fake/mock Bangumi client that records call counts).

**Frontend E2E** (manual, documented in test plan):
1. Open detail page for a TMDB-mapped anime under `zh-TW`.
2. Switch appearance language to `en-US` in settings.
3. Navigate back to the detail page — title/synopsis are still in zh-TW (cached).
4. Click refresh button — spinner appears, then title/synopsis render in English; toast fires.

**Edge cases:**
- AniList-only detail (id starts with `al-`): episode refresh is skipped (no Bangumi episodes endpoint).
- Upstream failure (Bangumi 5xx): error toast surfaces the message; cache is untouched.
- Rapid double-click: mutation `isPending` blocks the second click.

## Build sequence

1. Backend service-layer `refresh bool` plumbing + tests.
2. Backend handler query-param parsing + enricher refresh plumbing.
3. Frontend API client `refresh` option.
4. Frontend UI button + mutation + i18n keys.
5. Run `bun run i18n:extract` → translate → `bun run i18n:compile`.
6. Backend tests + frontend typecheck/lint.
7. Manual E2E in dev.

## Open questions

None — all decisions resolved during brainstorming.
