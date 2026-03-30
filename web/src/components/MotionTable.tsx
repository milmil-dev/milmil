'use no memo';

import { flexRender, type Table as TanStackTable } from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

interface MotionTableProps<T> {
  table: TanStackTable<T>;
  tableClassName?: string;
}

export function MotionTable<T>({ table, tableClassName }: MotionTableProps<T>) {
  return (
    <Table className={tableClassName}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className="border-white/[0.04] hover:bg-transparent">
            {headerGroup.headers.map((header) => {
              const width = header.column.columnDef.meta?.width;
              return (
                <TableHead
                  key={header.id}
                  className="text-[10px] uppercase tracking-wider text-white/30 font-medium h-auto pb-3"
                  style={width ? { width, minWidth: width, maxWidth: width } : undefined}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
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
