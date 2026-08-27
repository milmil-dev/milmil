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
    <div className="mt-5 flex items-center justify-between gap-4">
      {/* Left: rows-per-page + range */}
      <div className="flex items-center gap-3 text-[11px] text-ink/25">
        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline">{i18n._(msg`pagination.rows`)}</span>
          <div className="flex rounded-md bg-ink/[0.04] p-0.5">
            {PAGE_SIZE_OPTIONS.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => {
                  onPerPageChange(size);
                  onPageChange(1);
                }}
                className={`px-1.5 py-0.5 text-[10px] tabular-nums rounded transition-colors cursor-pointer ${
                  perPage === size ? 'bg-ink/[0.10] text-ink/70' : 'text-ink/25 hover:text-ink/50'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
        <span className="tabular-nums">
          <span className="text-ink/40">
            {rangeStart}–{rangeEnd}
          </span>{' '}
          {i18n._(msg`pagination.of`)} <span className="text-ink/40">{total.toLocaleString()}</span>
        </span>
      </div>

      {/* Right: page navigation */}
      <div className="flex items-center gap-1.5">
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious onClick={() => onPageChange(page - 1)} disabled={!canPrev} />
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
              <PaginationNext onClick={() => onPageChange(page + 1)} disabled={!canNext} />
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
      <span className="text-[10px] text-ink/20 hidden sm:inline">{goLabel}</span>
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
        className="h-7 w-10 rounded-md bg-ink/[0.05] text-center text-xs tabular-nums text-ink/50 outline-none transition-colors placeholder:text-ink/15 hover:bg-ink/[0.08] focus:bg-ink/[0.08] focus:text-ink/70"
      />
    </div>
  );
}
