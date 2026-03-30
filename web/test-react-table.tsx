import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import React from 'react';
import { renderToString } from 'react-dom/server';

const data = [{ id: 1, name: 'File 1' }];
const columns = [{ accessorKey: 'name', header: 'Name' }];

function MotionTable({ table }: any) {
  const rows = table.getRowModel().rows;
  return <div>Rows: {rows.length}</div>;
}

function App() {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return <MotionTable table={table} />;
}

console.log(renderToString(<App />));
