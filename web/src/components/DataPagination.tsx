import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useState } from 'react';
import {
  Pagination,
  PaginationButton,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from './ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface DataPaginationProps {
  total: number;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function DataPagination({
  total,
  page,
  perPage,
  onPageChange,
  onPerPageChange,
}: DataPaginationProps) {
  const { i18n } = useLingui();
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const rangeStart = (page - 1) * perPage + 1;
  const rangeEnd = Math.min(page * perPage, total);

  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const delta = 1;
    const range: number[] = [];
    const result: (number | 'ellipsis')[] = [];
    let prev: number | undefined;

    // Fix potential crash by not doing O(N) where N is total pages
    // Calculate range explicitly
    const left = Math.max(2, page - delta);
    const right = Math.min(totalPages - 1, page + delta);

    range.push(1);
    if (totalPages > 1) {
      for (let i = left; i <= right; i++) {
        range.push(i);
      }
      range.push(totalPages);
    }

    for (const i of range) {
      if (prev !== undefined) {
        if (i - prev === 2) {
          result.push(prev + 1);
        } else if (i - prev > 2) {
          result.push('ellipsis');
        }
      }
      result.push(i);
      prev = i;
    }

    return result;
  };

  return (
    <div className="mt-6 flex items-center justify-between gap-4">
      {/* Left: rows-per-page + range */}
      <div className="flex items-center gap-3 text-[11px] text-white/30">
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">{i18n._(msg`pagination.rows`)}</span>
          <Select
            value={String(perPage)}
            onValueChange={(v) => {
              onPerPageChange(Number(v));
              onPageChange(1);
            }}
          >
            <SelectTrigger className="h-7 w-[58px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="tabular-nums">
          <span className="text-white/50">
            {rangeStart}–{rangeEnd}
          </span>{' '}
          {i18n._(msg`pagination.of`)}{' '}
          <span className="text-white/50">{total.toLocaleString()}</span>
        </span>
      </div>

      {/* Right: page navigation */}
      <div className="flex items-center gap-2">
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => onPageChange(page - 1)}
                disabled={!canPrev}
                aria-label={i18n._(msg`pagination.prevPage`)}
              />
            </PaginationItem>

            {getPageNumbers().map((p, idx) => (
              <PaginationItem key={typeof p === 'number' ? p : `e-${idx}`}>
                {p === 'ellipsis' ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationButton isActive={page === p} onClick={() => onPageChange(p as number)}>
                    {p}
                  </PaginationButton>
                )}
              </PaginationItem>
            ))}

            <PaginationItem>
              <PaginationNext
                onClick={() => onPageChange(page + 1)}
                disabled={!canNext}
                aria-label={i18n._(msg`pagination.nextPage`)}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>

        {/* Page jump */}
        {totalPages > 5 && (
          <PageJumpInput
            currentPage={page}
            totalPages={totalPages}
            onJump={onPageChange}
            goLabel={i18n._(msg`pagination.go`)}
          />
        )}
      </div>
    </div>
  );
}

function PageJumpInput({
  currentPage,
  totalPages,
  onJump,
  goLabel,
}: {
  currentPage: number;
  totalPages: number;
  onJump: (page: number) => void;
  goLabel: string;
}) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    const num = Number.parseInt(value, 10);
    if (num >= 1 && num <= totalPages && num !== currentPage) {
      onJump(num);
    }
    setValue('');
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-white/30 hidden sm:inline">{goLabel}</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        placeholder={String(currentPage)}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
        }}
        onBlur={handleSubmit}
        className="h-7 w-10 rounded-md border border-white/[0.08] bg-white/[0.04] text-center text-xs tabular-nums text-white/70 outline-none transition-colors placeholder:text-white/20 hover:border-white/15 focus:border-mm-accent/40 focus:ring-1 focus:ring-mm-accent/20"
      />
    </div>
  );
}
