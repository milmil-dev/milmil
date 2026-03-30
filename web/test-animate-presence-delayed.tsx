import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';

function TestApp() {
  const [items, setItems] = useState<number[]>([]);

  // Simulate data fetching
  useEffect(() => {
    setTimeout(() => {
      setItems([1, 2, 3]);
    }, 100);
  }, []);

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

// In a real browser, the first render has items=[], so AnimatePresence mounts with children=[]
// When items become [1,2,3], initial={false} ONLY applies to children present at INITIAL MOUNT of AnimatePresence.
// So new children (1,2,3) WILL animate from opacity: 0 because they are entering AFTER mount.
console.log('Empty initial mount renders nothing:', renderToString(<TestApp />));
