import { ArrowLeft01Icon, ArrowRight01Icon, MoreHorizontalIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  );
}

function PaginationContent({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn('flex flex-row items-center gap-0.5', className)}
      {...props}
    />
  );
}

function PaginationItem({ ...props }: React.ComponentProps<'li'>) {
  return <li data-slot="pagination-item" {...props} />;
}

type PaginationButtonProps = {
  isActive?: boolean;
  disabled?: boolean;
} & React.ComponentProps<'button'>;

function PaginationButton({ className, isActive, disabled, ...props }: PaginationButtonProps) {
  return (
    <button
      type="button"
      aria-current={isActive ? 'page' : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center size-8 rounded-md text-xs font-medium tabular-nums transition-colors cursor-pointer',
        'disabled:pointer-events-none disabled:opacity-30',
        isActive
          ? 'bg-ink/[0.10] text-ink'
          : 'text-ink/40 hover:bg-ink/[0.06] hover:text-ink/70',
        className
      )}
      {...props}
    />
  );
}

function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<typeof PaginationButton>) {
  const { i18n } = useLingui();
  return (
    <PaginationButton
      aria-label={i18n._(msg`pagination.prevPage`)}
      className={cn('w-auto gap-1 px-2', className)}
      {...props}
    >
      <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
      <span className="hidden sm:block text-[11px]">{i18n._(msg`pagination.prev`)}</span>
    </PaginationButton>
  );
}

function PaginationNext({ className, ...props }: React.ComponentProps<typeof PaginationButton>) {
  const { i18n } = useLingui();
  return (
    <PaginationButton
      aria-label={i18n._(msg`pagination.nextPage`)}
      className={cn('w-auto gap-1 px-2', className)}
      {...props}
    >
      <span className="hidden sm:block text-[11px]">{i18n._(msg`pagination.next`)}</span>
      <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
    </PaginationButton>
  );
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<'span'>) {
  const { i18n } = useLingui();
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn('flex size-8 items-center justify-center text-ink/20', className)}
      {...props}
    >
      <HugeiconsIcon icon={MoreHorizontalIcon} size={14} />
      <span className="sr-only">{i18n._(msg`pagination.morePages`)}</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationButton,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
