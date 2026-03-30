import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import React from 'react';
import { renderToString } from 'react-dom/server';

const data = [{ id: 1, name: 'File 1' }];
const columns = [{ accessorKey: 'name', header: 'Name' }];

function TestTable() {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div>
      {table.getRowModel().rows.map((row) => (
        <div key={row.id}>{row.original.name}</div>
      ))}
    </div>
  );
}

console.log(renderToString(<TestTable />));
