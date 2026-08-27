import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../lib/utils';

/**
 * Loading placeholders. One shimmer for the whole app: a highlight sweeps
 * across the block rather than the whole block blinking, and Reduce Motion
 * falls back to a slow fade.
 *
 * Shape the skeleton like the content that replaces it — same sizes, same
 * spacing — so nothing jumps when the data lands.
 */
export function Skeleton({ className, style, ...rest }: SkeletonProps) {
  return (
    <div
      className={cn('skeleton-shimmer rounded-md bg-ink/[0.04]', className)}
      style={style}
      aria-hidden
      {...rest}
    />
  );
}

/** `data-testid` passes through so tests can still target a specific block. */
type SkeletonProps = {
  className?: string;
  style?: CSSProperties;
  'data-testid'?: string;
};

/** A text line; `h-*` should match the line height it stands in for. */
export function SkeletonText({ className, ...rest }: SkeletonProps) {
  return <Skeleton className={cn('h-3 rounded-full bg-ink/[0.055]', className)} {...rest} />;
}

/** Wrapped prose: full-width lines with a short last one. */
export function SkeletonParagraph({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonText key={i} className={i === lines - 1 ? 'w-1/2' : 'w-full'} />
      ))}
    </div>
  );
}

/** Poster grid placeholder — 2:3 covers with a title line. */
export function SkeletonPosterGrid({
  count = 12,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-x-4 gap-y-6 grid-cols-3 min-[768px]:grid-cols-4 min-[1100px]:grid-cols-6',
        className
      )}
      aria-label="loading"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <Skeleton className="aspect-[2/3] rounded-lg" />
          <SkeletonText className="mt-2.5 w-3/4" />
        </div>
      ))}
    </div>
  );
}

/** Rows inside a grouped card — notifications, files, downloads. */
export function SkeletonRows({
  count = 6,
  leading = true,
  className,
}: {
  count?: number;
  /** Leading square (poster, still, avatar). */
  leading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg bg-ink/[0.03] overflow-hidden', className)} aria-label="loading">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'flex items-center gap-3 px-3.5 h-14',
            i > 0 && 'border-t border-ink/[0.05]'
          )}
        >
          {leading && <Skeleton className="w-10 h-10 shrink-0 rounded-md" />}
          <div className="flex-1 min-w-0 space-y-2">
            <SkeletonText className="w-1/2 max-w-[220px]" />
            <SkeletonText className="w-1/4 max-w-[130px] h-2.5" />
          </div>
          <SkeletonText className="w-12 h-2.5 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** A titled section of rows. */
export function SkeletonSection({
  rows = 4,
  leading = true,
  children,
}: {
  rows?: number;
  leading?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="space-y-3">
      {children ?? <SkeletonText className="w-24 h-3.5" />}
      <SkeletonRows count={rows} leading={leading} />
    </section>
  );
}
