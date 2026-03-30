import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';

function App() {
  const [items, setItems] = useState<number[]>([]);

  useEffect(() => {
    // simulate fetching
    setItems([1, 2, 3]);
  }, []);

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {items.map((id, index) => (
        <motion.div
          key={id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{
            duration: 0.3,
            delay: index * 0.04, // This delay makes them appear slowly ONE AFTER ANOTHER
            ease: [0.23, 1, 0.32, 1],
          }}
        >
          {id}
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
// the delay is `index * 0.04`, which is fine. The first item has delay 0.
