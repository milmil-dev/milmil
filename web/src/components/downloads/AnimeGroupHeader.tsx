// web/src/components/downloads/AnimeGroupHeader.tsx

import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Fragment } from 'react';
import { AnimeCoverBlock } from './AnimeCoverBlock';

export type GroupMode = 'subscribed' | 'downloading' | 'completed';

export interface GroupStats {
  mode: GroupMode;
  percent: number;
  speedBytes?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  etaSeconds?: number;
  activeCount?: number;
  episodeCount?: number;
  completedCount?: number;
  completedAtRelative?: string;
  nextFetchRelative?: string;
  live: boolean;
}

interface Props {
  coverUrl?: string;
  title: string;
  subChips: string[];
  stats: GroupStats;
  expanded: boolean;
  onToggle: () => void;
  headerActions?: React.ReactNode;
  onOpenAnime?: () => void;
}

function formatBytes(n?: number): string {
  if (n === undefined) return '';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}
function formatSpeed(n?: number): string {
  return n === undefined ? '' : `${formatBytes(n)}/s`;
}
function formatEta(s?: number): string {
  if (s === undefined || s <= 0) return '';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

export function AnimeGroupHeader({
  coverUrl,
  title,
  subChips,
  stats,
  expanded,
  onToggle,
  headerActions,
  onOpenAnime,
}: Props) {
  const { i18n } = useLingui();
  const { mode, percent } = stats;
  const showProgressBar = mode !== 'completed';

  return (
    <div className="grid grid-cols-[92px_1fr_auto] gap-5 p-4">
      {onOpenAnime ? (
        <button
          type="button"
          onClick={onOpenAnime}
          className="shrink-0 rounded-lg cursor-pointer hover:opacity-85 transition-opacity focus:outline-none"
        >
          <AnimeCoverBlock coverUrl={coverUrl} title={title} />
        </button>
      ) : (
        <AnimeCoverBlock coverUrl={coverUrl} title={title} />
      )}

      <div className="min-w-0 flex flex-col justify-between py-0.5">
        <div>
          {onOpenAnime ? (
            <button
              type="button"
              onClick={onOpenAnime}
              className="text-[15px] font-semibold text-white/90 tracking-[-0.01em] truncate text-left hover:underline underline-offset-2 decoration-white/30 cursor-pointer"
            >
              {title}
            </button>
          ) : (
            <h3 className="text-[15px] font-semibold text-white/90 tracking-[-0.01em] truncate">
              {title}
            </h3>
          )}
          <div className="mt-1 flex gap-2 items-center text-[11px] text-white/40">
            {subChips.map((chip) => (
              <span
                key={chip}
                className="px-[7px] py-[2px] rounded bg-white/[0.04] text-white/65 text-[10px]"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
        <StatLine stats={stats} i18n={i18n} />
        {showProgressBar && (
          <div className="mt-2.5 h-[2px] bg-[rgba(74,222,128,0.06)] rounded-sm overflow-hidden">
            <div
              data-testid="progress-fill"
              className="h-full rounded-sm"
              style={{
                width: `${percent}%`,
                background: 'linear-gradient(90deg, rgba(74,222,128,0.85), #4ade80)',
              }}
            />
          </div>
        )}
        {!showProgressBar && (
          <div data-testid="progress-fill-neutral" className="mt-2.5 h-[1px] bg-white/[0.14]" />
        )}
      </div>

      <div className="flex flex-col items-end justify-between gap-2">
        <div className="flex items-center gap-2">
          {headerActions}
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? i18n._(msg`downloads.collapse`) : i18n._(msg`downloads.expand`)}
            className="flex items-center gap-1.5 text-[11px] text-white/25 hover:text-white/65 cursor-pointer"
          >
            <span>
              {expanded ? i18n._(msg`downloads.collapse`) : i18n._(msg`downloads.expand`)}
            </span>
            <HugeiconsIcon icon={expanded ? ArrowUp01Icon : ArrowDown01Icon} size={11} />
          </button>
        </div>
        <div className="flex items-baseline gap-1 text-white/90">
          <span className="text-[20px] font-medium tracking-[-0.02em] tabular-nums">{percent}</span>
          <span className="text-[14px] font-light text-white/50">%</span>
        </div>
      </div>
    </div>
  );
}

type StatPart = { id: string; node: React.ReactNode };

function StatLine({
  stats,
  i18n,
}: {
  stats: GroupStats;
  i18n: ReturnType<typeof useLingui>['i18n'];
}) {
  const parts: StatPart[] = [];

  if (stats.live) {
    parts.push({
      id: 'live',
      node: (
        <span
          data-testid="live-dot"
          className="w-[5px] h-[5px] rounded-full bg-[#4ade80] animate-[pulse_1.6s_ease-in-out_infinite]"
        />
      ),
    });
  }

  if (stats.mode === 'downloading') {
    parts.push({
      id: 'n',
      node: (
        <span>
          <b className="text-white/90 font-medium">{stats.activeCount ?? 0}</b>{' '}
          {i18n._(msg`downloads.downloading`)}
        </span>
      ),
    });
    if (stats.speedBytes !== undefined)
      parts.push({
        id: 's',
        node: (
          <span>
            <b className="text-white/90 font-medium tabular-nums">
              {formatSpeed(stats.speedBytes)}
            </b>
          </span>
        ),
      });
    if (stats.downloadedBytes !== undefined && stats.totalBytes !== undefined)
      parts.push({
        id: 'd',
        node: (
          <span className="tabular-nums">
            {formatBytes(stats.downloadedBytes)} / {formatBytes(stats.totalBytes)}
          </span>
        ),
      });
    if (stats.etaSeconds !== undefined)
      parts.push({
        id: 'e',
        node: <span className="tabular-nums">~{formatEta(stats.etaSeconds)}</span>,
      });
  } else if (stats.mode === 'subscribed') {
    parts.push({
      id: 'm',
      node: (
        <span>
          {stats.live ? i18n._(msg`downloads.autoEnabled`) : i18n._(msg`downloads.autoDisabled`)}
        </span>
      ),
    });
    if (stats.nextFetchRelative)
      parts.push({
        id: 'nf',
        node: (
          <span>
            {i18n._(msg`downloads.nextFetch`)} ~{stats.nextFetchRelative}
          </span>
        ),
      });
    if (stats.activeCount !== undefined && stats.episodeCount !== undefined)
      parts.push({
        id: 'eps',
        node: (
          <span className="tabular-nums">
            {stats.activeCount} / {stats.episodeCount} eps
          </span>
        ),
      });
    else if (stats.activeCount !== undefined)
      parts.push({
        id: 'ec',
        node: <span className="tabular-nums">{stats.activeCount} eps</span>,
      });
  } else {
    if (stats.completedCount !== undefined)
      parts.push({
        id: 'c',
        node: <span className="tabular-nums">{stats.completedCount} eps</span>,
      });
    if (stats.totalBytes !== undefined)
      parts.push({
        id: 'sz',
        node: <span className="tabular-nums">{formatBytes(stats.totalBytes)}</span>,
      });
    if (stats.completedAtRelative)
      parts.push({
        id: 'at',
        node: (
          <span>
            {i18n._(msg`downloads.completedAt`)} {stats.completedAtRelative}
          </span>
        ),
      });
  }

  return (
    <div className="mt-1 flex items-center gap-2 text-[12px] text-white/45 flex-wrap">
      {parts.map(({ id, node }, idx) => (
        <Fragment key={id}>
          {idx > 0 && <span className="text-white/15">·</span>}
          {node}
        </Fragment>
      ))}
    </div>
  );
}
