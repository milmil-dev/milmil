import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

interface PageHeaderProps {
  title: ReactNode;
  /** One quiet line under the title: a count, a path, a short description. */
  subtitle?: ReactNode;
  /** Rendered above the title, e.g. a "← Libraries" back link. */
  back?: ReactNode;
  /** Page-level actions, right-aligned. Put at most one `variant="accent"` button here. */
  actions?: ReactNode;
  className?: string;
}

/**
 * The one header every top-level page uses: title, optional subtitle, and
 * actions on the right (stacked under the title on phones). Pages own their
 * horizontal padding; this only owns the header's own rhythm.
 */
export function PageHeader({ title, subtitle, back, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className
      )}
    >
      <div className="min-w-0">
        {back && <div className="mb-2">{back}</div>}
        <h1 className="text-2xl sm:text-[28px] font-bold leading-tight tracking-tight text-ink">
          {title}
        </h1>
        {subtitle && <div className="mt-1 text-[13px] text-ink/50">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
