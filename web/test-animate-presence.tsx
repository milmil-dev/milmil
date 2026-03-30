import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';

function TestApp() {
  const [items, setItems] = useState<number[]>([1, 2, 3]);

  return (
    <div>
      <AnimatePresence initial={false}>
        {items.map((id) => (
          <motion.div key={id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            Item {id}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

console.log(renderToString(<TestApp />));
