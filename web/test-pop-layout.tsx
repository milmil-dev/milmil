import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';

function TestTable() {
  const [items, setItems] = useState<number[]>([]);
  useEffect(() => {
    setItems([1, 2, 3]);
  }, []);

  return (
    <table>
      <tbody>
        <AnimatePresence mode="popLayout" initial={false}>
          {items.map((id) => (
            <motion.tr key={id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <td>{id}</td>
            </motion.tr>
          ))}
        </AnimatePresence>
      </tbody>
    </table>
  );
}

console.log(renderToString(<TestTable />));
