import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';

const data = [{ id: 1, name: 'File 1' }];
const columns = [{ accessorKey: 'name', header: 'Name' }];

function MotionTable({ table }: any) {
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
            >
              <td>{row.original.name}</td>
            </motion.tr>
          ))}
        </AnimatePresence>
      </tbody>
    </table>
  );
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
