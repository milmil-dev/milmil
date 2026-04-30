'use no memo';

import { flexRender, type Header, type Table as TanStackTable } from '@tanstack/react-table';
import { useEffect, useRef } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

const SORTABLE_COLUMNS = new Set(['filename', 'size_bytes', 'match_status', 'subtitle_count']);

interface MotionTableProps<T> {
  table: TanStackTable<T>;
  tableClassName?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (columnId: string) => void;
  // When set, MotionTable emits onColumnResizeEnd(colId, newWidth) once
  // per drag (on mouseup). The caller decides whether/where to persist.
  tableId?: string;
  onColumnResizeEnd?: (columnId: string, width: number) => void;
}

function SortIcon({ active, direction }: { active: boolean; direction?: 'asc' | 'desc' }) {
  if (active && direction) {
    return (
      <svg
        className="w-3 h-3 shrink-0 text-white/50"
        viewBox="0 0 12 12"
        fill="currentColor"
        aria-hidden="true"
      >
        {direction === 'asc' ? (
          <polygon points="6,2 10,8 2,8" />
        ) : (
          <polygon points="6,10 2,4 10,4" />
        )}
      </svg>
    );
  }
  return (
    <svg
      className="w-3 h-3 shrink-0 text-white/10"
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
    >
      <polygon points="6,1 9,5 3,5" />
      <polygon points="6,11 3,7 9,7" />
    </svg>
  );
}

function ResizeHandle<T>({
  header,
  onReset,
}: {
  header: Header<T, unknown>;
  onReset?: (columnId: string) => void;
}) {
  const isResizing = header.column.getIsResizing();
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize. Double-click to reset."
      onMouseDown={(e) => {
        e.stopPropagation();
        header.getResizeHandler()(e);
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        header.getResizeHandler()(e);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReset?.(header.column.id);
      }}
      className="group absolute top-0 right-[-3px] z-10 flex h-full w-[6px] cursor-col-resize touch-none select-none items-stretch justify-center"
    >
      <span
        className={[
          'w-[2px] transition-colors',
          isResizing ? 'bg-white/60' : 'bg-transparent group-hover:bg-white/30',
        ].join(' ')}
      />
    </div>
  );
}

export function MotionTable<T>({
  table,
  tableClassName,
  sortBy,
  sortOrder,
  onSort,
  onColumnResizeEnd,
}: MotionTableProps<T>) {
  const resizingColId = table.getState().columnSizingInfo.isResizingColumn;
  const wasResizingRef = useRef<string | false>(false);

  useEffect(() => {
    if (wasResizingRef.current && !resizingColId) {
      const colId = wasResizingRef.current;
      const col = table.getColumn(colId);
      if (col && onColumnResizeEnd) {
        onColumnResizeEnd(colId, col.getSize());
      }
    }
    wasResizingRef.current = resizingColId;
  }, [resizingColId, onColumnResizeEnd, table]);

  return (
    <Table className={tableClassName}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className="border-white/[0.04] hover:bg-transparent">
            {headerGroup.headers.map((header) => {
              const width = header.getSize();
              const colId = header.column.id;
              const isSortable = SORTABLE_COLUMNS.has(colId) && !!onSort;
              const isActive = isSortable && sortBy === colId;

              return (
                <TableHead
                  key={header.id}
                  className={[
                    'relative text-[10px] uppercase tracking-wider text-white/30 font-medium h-auto pb-3',
                    isSortable
                      ? 'cursor-pointer select-none hover:text-white/50 transition-colors'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ width, minWidth: width, maxWidth: width }}
                  onClick={isSortable ? () => onSort(colId) : undefined}
                >
                  {header.isPlaceholder ? null : (
                    <span className="inline-flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {isSortable && (
                        <SortIcon active={isActive} direction={isActive ? sortOrder : undefined} />
                      )}
                    </span>
                  )}
                  {header.column.getCanResize() ? (
                    <ResizeHandle
                      header={header}
                      onReset={(colId) => onColumnResizeEnd?.(colId, Number.NaN)}
                    />
                  ) : null}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            className="group border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors duration-150"
          >
            {row.getVisibleCells().map((cell) => {
              const width = cell.column.getSize();
              return (
                <TableCell
                  key={cell.id}
                  className="py-3 transition-colors duration-150 group-hover:text-mm-accent/80"
                  style={{ width, minWidth: width, maxWidth: width }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
