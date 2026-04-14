'use no memo';

import { flexRender, type Table as TanStackTable } from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

const SORTABLE_COLUMNS = new Set(['filename', 'size_bytes', 'match_status', 'subtitle_count']);

interface MotionTableProps<T> {
  table: TanStackTable<T>;
  tableClassName?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (columnId: string) => void;
}

function SortIcon({
  active,
  direction,
}: {
  active: boolean;
  direction?: 'asc' | 'desc';
}) {
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

export function MotionTable<T>({
  table,
  tableClassName,
  sortBy,
  sortOrder,
  onSort,
}: MotionTableProps<T>) {
  return (
    <Table className={tableClassName}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className="border-white/[0.04] hover:bg-transparent">
            {headerGroup.headers.map((header) => {
              const width = header.column.columnDef.meta?.width;
              const colId = header.column.id;
              const isSortable = SORTABLE_COLUMNS.has(colId) && !!onSort;
              const isActive = isSortable && sortBy === colId;

              return (
                <TableHead
                  key={header.id}
                  className={[
                    'text-[10px] uppercase tracking-wider text-white/30 font-medium h-auto pb-3',
                    isSortable
                      ? 'cursor-pointer select-none hover:text-white/50 transition-colors'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={width ? { width, minWidth: width, maxWidth: width } : undefined}
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
              const width = cell.column.columnDef.meta?.width;
              return (
                <TableCell
                  key={cell.id}
                  className="py-3 transition-colors duration-150 group-hover:text-mm-accent/80"
                  style={width ? { width, minWidth: width, maxWidth: width } : undefined}
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
