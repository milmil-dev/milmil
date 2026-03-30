import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';

function TestApp() {
  const [items, setItems] = useState<number[]>([]);

  useEffect(() => {
    // Initial mount is empty
    setItems([1, 2, 3]);
  }, []);

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {items.map((id) => (
        <motion.div key={id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          Item {id}
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

console.log('Empty initial mount renders nothing:', renderToString(<TestApp />));
