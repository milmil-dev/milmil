import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { JSDOM } from 'jsdom';
import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

const dom = new JSDOM('<!DOCTYPE html><div id="root"></div>');
global.window = dom.window as any;
global.document = dom.window.document as any;
// global.navigator = dom.window.navigator; // omit navigator assignment
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
  console.log('MotionTable renders with rows:', table.getRowModel().rows.length);
  return (
    <table>
      <tbody>
        <AnimatePresence mode="popLayout" initial={false}>
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
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const { data: qData, isLoading } = useQuery({
    queryKey: ['test', debouncedSearch],
    queryFn: async () => {
      console.log('Fetching data...');
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

  if (!isLoading && files.length === 0 && !debouncedSearch) {
    console.log('Rendering empty state');
    return <div>Empty State</div>;
  }

  return (
    <div>
      <MotionTable table={table} />
      {isLoading && <div>Loading...</div>}
    </div>
  );
}

const queryClient = new QueryClient();
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TestComponent />
    </QueryClientProvider>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

setTimeout(() => {
  console.log('After 200ms DOM:', document.getElementById('root')!.innerHTML);
}, 200);

setTimeout(() => {
  console.log('After 500ms DOM:', document.getElementById('root')!.innerHTML);
  process.exit(0);
}, 500);
