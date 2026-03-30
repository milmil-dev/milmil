import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { JSDOM } from 'jsdom';
import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

const dom = new JSDOM('<!DOCTYPE html><div id="root"></div>');
global.window = dom.window as any;
global.document = dom.window.document as any;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = clearTimeout;

const data = [
  { id: 1, name: 'File 1' },
  { id: 2, name: 'File 2' },
];
const columns = [
  { accessorKey: 'name', header: 'Name', cell: ({ row }: any) => row.original.name },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function MotionTable({ table }: any) {
  return (
    <table>
      <tbody>
        <AnimatePresence mode="popLayout" initial={true}>
          {table.getRowModel().rows.map((row: any, index: number) => (
            <motion.tr
              key={row.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{
                duration: 0.3,
                delay: index * 0.04,
                ease: [0.23, 1, 0.32, 1],
                layout: { duration: 0.2 },
              }}
            >
              <td>{row.original.name}</td>
            </motion.tr>
          ))}
        </AnimatePresence>
      </tbody>
    </table>
  );
}

function TestComponent() {
  const [debouncedSearch] = useState('');

  const { data: qData, isLoading } = useQuery({
    queryKey: ['test', debouncedSearch],
    queryFn: async () => {
      await sleep(100);
      return { items: data };
    },
  });

  const files = qData?.items || [];

  const table = useReactTable({
    data: files,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div>
      <MotionTable table={table} />
    </div>
  );
}

const queryClient = new QueryClient();
const root = createRoot(document.getElementById('root')!);
root.render(
  <QueryClientProvider client={queryClient}>
    <TestComponent />
  </QueryClientProvider>
);

setTimeout(() => {
  console.log('After 500ms DOM:', document.getElementById('root')!.innerHTML);
  process.exit(0);
}, 500);
