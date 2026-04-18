// web/src/pages/downloads/shared/adapters.ts
import type { DownloadGroup, RSSFeed, DownloadRule } from '@/lib/api/downloads';

export interface ActiveRowInput {
  gid: string;
  episodeLabel: string;
  downloadedBytes: number;
  totalBytes: number;
  speedBytes: number;
  etaSeconds: number;
  percent: number;
  status: 'active' | 'paused' | 'waiting';
}

export interface CompleteRowInput {
  gid: string;
  episodeLabel: string;
  filename: string;
  sizeBytes: number;
  completedAtRelative: string;
}

/**
 * Parse "EP xx" label from a download name.
 * Reuses the episode regex from the existing file parser — falls back to "—" if unparseable.
 */
export function parseEpisodeLabel(name: string): string {
  // Same regex as rss/helpers.go — keep in sync.
  const m = name.match(/\s-\s(\d{1,3})\b|\[(\d{1,3})\]|S\d{1,2}E(\d{1,3})/i);
  if (!m) return '—';
  const num = m[1] ?? m[2] ?? m[3];
  return num ? `EP ${num.padStart(2, '0')}` : '—';
}

export function statusToActiveStatus(status: string): 'active' | 'paused' | 'waiting' {
  if (status === 'paused') return 'paused';
  if (status === 'waiting') return 'waiting';
  return 'active';
}

/**
 * Convert a DownloadGroup download row to EpisodeRowActive props (minus event handlers).
 */
export function toActiveProps(
  d: DownloadGroup['downloads'][number],
): ActiveRowInput {
  const percent = d.total_bytes > 0
    ? Math.min(100, Math.round((d.completed_bytes / d.total_bytes) * 100))
    : 0;
  const remaining = Math.max(0, d.total_bytes - d.completed_bytes);
  const etaSeconds = d.speed_bytes > 0 ? Math.round(remaining / d.speed_bytes) : 0;
  return {
    gid: d.gid,
    episodeLabel: parseEpisodeLabel(d.name),
    downloadedBytes: d.completed_bytes,
    totalBytes: d.total_bytes,
    speedBytes: d.speed_bytes,
    etaSeconds,
    percent,
    status: statusToActiveStatus(d.status),
  };
}

/**
 * Convert a completed DownloadGroup row to EpisodeRowComplete props.
 */
export function toCompleteProps(
  d: DownloadGroup['downloads'][number],
): CompleteRowInput {
  return {
    gid: d.gid,
    episodeLabel: parseEpisodeLabel(d.name),
    filename: d.name,
    sizeBytes: d.total_bytes,
    completedAtRelative: formatRelative(d.created_at),
  };
}

/**
 * Format an ISO timestamp as "Nh ago" / "Nd ago" — rough for stat lines.
 */
export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const s = Math.round(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

/**
 * Next-fetch relative string for an RSS feed based on fetch_interval_minutes and last_fetched_at.
 */
export function deriveNextFetch(feed?: RSSFeed): string | undefined {
  if (!feed || !feed.last_fetched_at) return undefined;
  const lastFetchedMs = new Date(feed.last_fetched_at).getTime();
  const interval = feed.fetch_interval_minutes;
  if (!Number.isFinite(lastFetchedMs) || !Number.isFinite(interval) || interval <= 0) {
    return undefined;
  }
  const nextMs = lastFetchedMs + interval * 60_000;
  const diffMs = nextMs - Date.now();
  if (diffMs <= 0) return 'now';
  const m = Math.round(diffMs / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return `${h} h`;
}

/**
 * Aggregate stats across a group's active downloads.
 */
export function aggregateActiveStats(eps: DownloadGroup['downloads']) {
  const total = eps.reduce((s, d) => s + d.total_bytes, 0);
  const downloaded = eps.reduce((s, d) => s + d.completed_bytes, 0);
  const speed = eps.reduce((s, d) => s + d.speed_bytes, 0);
  const remaining = Math.max(0, total - downloaded);
  const etaSeconds = speed > 0 ? Math.round(remaining / speed) : 0;
  const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
  return { speed, downloaded, total, etaSeconds, percent };
}

/**
 * Overall percent for a group (considers all downloads regardless of status).
 */
export function deriveGroupPercent(group?: DownloadGroup): number {
  if (!group || group.downloads.length === 0) return 0;
  const total = group.downloads.reduce((s, d) => s + d.total_bytes, 0);
  const done = group.downloads.reduce((s, d) => s + d.completed_bytes, 0);
  return total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
}

/**
 * Quick sub-chip list for a rule — filters empty / returns up to 2.
 */
export function ruleSubChips(rule: DownloadRule): string[] {
  return [rule.subgroup_filter, rule.resolution_filter]
    .filter((s): s is string => !!s && s.trim().length > 0);
}

export type CardMode = 'downloading' | 'subscribed' | 'completed';
export type SortKey = 'activity' | 'name' | 'progress' | 'created';

export interface LibraryItem {
  rule: DownloadRule;
  group: DownloadGroup | undefined;
  feed: RSSFeed | undefined;
}

/**
 * Priority:
 * 1. Any active ep → downloading
 * 2. No active + (rule disabled OR at least one completed ep) → completed
 * 3. No active + rule enabled + zero completed → subscribed (pending — waiting for first trigger)
 */
export function deriveCardMode(
  group: DownloadGroup | undefined,
  rule: DownloadRule,
): CardMode {
  const hasActive = (group?.downloads ?? []).some(
    (d) => d.status === 'active' || d.status === 'paused' || d.status === 'waiting',
  );
  if (hasActive) return 'downloading';
  const completeCount = group?.complete_count ?? 0;
  if (rule.enabled === 1 && completeCount === 0) return 'subscribed';
  return 'completed';
}

export function deriveEpsForExpand(
  group: DownloadGroup | undefined,
  mode: CardMode,
): DownloadGroup['downloads'] {
  if (!group || mode === 'subscribed') return [];
  const eps = group.downloads.filter((d) => {
    if (mode === 'downloading') {
      return d.status === 'active' || d.status === 'paused' || d.status === 'waiting';
    }
    return d.status === 'complete';
  });
  if (mode === 'downloading') {
    return [...eps].sort((a, b) => {
      const etaA = a.speed_bytes > 0 ? (a.total_bytes - a.completed_bytes) / a.speed_bytes : Infinity;
      const etaB = b.speed_bytes > 0 ? (b.total_bytes - b.completed_bytes) / b.speed_bytes : Infinity;
      return etaA - etaB;
    });
  }
  // completed — sort by created_at desc
  return [...eps].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function isActiveGroup(g: DownloadGroup | undefined): boolean {
  return !!g && g.downloads.some(
    (d) => d.status === 'active' || d.status === 'paused' || d.status === 'waiting',
  );
}

export function sortRulesBy(items: LibraryItem[], key: SortKey): LibraryItem[] {
  const copy = [...items];
  const nameCmp = (a: LibraryItem, b: LibraryItem) =>
    a.rule.name.localeCompare(b.rule.name);

  switch (key) {
    case 'name':
      return copy.sort(nameCmp);
    case 'progress':
      return copy.sort((a, b) => {
        const pa = deriveGroupPercent(a.group);
        const pb = deriveGroupPercent(b.group);
        return pb - pa || nameCmp(a, b);
      });
    case 'created':
      return copy.sort((a, b) => {
        const ta = new Date(a.rule.created_at || 0).getTime();
        const tb = new Date(b.rule.created_at || 0).getTime();
        return tb - ta || nameCmp(a, b);
      });
    case 'activity':
    default:
      return copy.sort((a, b) => {
        const aActive = isActiveGroup(a.group);
        const bActive = isActiveGroup(b.group);
        if (aActive !== bActive) return aActive ? -1 : 1;
        const ta = new Date(a.rule.last_triggered_at || a.rule.created_at || 0).getTime();
        const tb = new Date(b.rule.last_triggered_at || b.rule.created_at || 0).getTime();
        return tb - ta || nameCmp(a, b);
      });
  }
}
