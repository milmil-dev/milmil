import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import React, { useEffect, useState } from 'react';

const data = [{ id: 1, name: 'File 1' }];
const columns = [{ accessorKey: 'name', header: 'Name' }];

function MotionTable({ table }: any) {
  const rows = table.getRowModel().rows;
  console.log('MotionTable rendering. Rows:', rows.length);
  return null;
}

function App() {
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('App mounted. Starting fetch...');
    setTimeout(() => {
      console.log('Fetch complete.');
      setItems([{ id: 1, name: 'File 1' }]);
      setIsLoading(false);
    }, 10);
  }, []);

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (!isLoading && items.length === 0) {
    console.log('Rendering empty state');
    return null;
  }

  console.log('App rendering. Items:', items.length, 'isLoading:', isLoading);

  return <MotionTable table={table} />;
}

import { renderToString } from 'react-dom/server';

console.log(renderToString(<App />));
