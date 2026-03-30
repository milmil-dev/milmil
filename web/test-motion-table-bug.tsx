import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';

function App() {
  const [items, setItems] = useState<number[]>([]);

  useEffect(() => {
    // Simulate query completing
    setTimeout(() => {
      setItems([1, 2, 3]);
    }, 10);
  }, []);

  return (
    <table>
      <tbody>
        <AnimatePresence mode="popLayout" initial={false}>
          {items.map((id) => (
            <motion.tr
              key={id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
            >
              <td>{id}</td>
            </motion.tr>
          ))}
        </AnimatePresence>
      </tbody>
    </table>
  );
}

// Just checking if there is a known issue.
// If AnimatePresence mounts with NO children, and then children are added...
// The first set of children WILL get initial={true} animations even if initial={false} on AnimatePresence,
// wait, NO!
// If initial={false} is set on AnimatePresence, ONLY children present on mount have initial animations disabled.
// Any children added AFTER mount WILL animate in.
// So the rows should animate in smoothly.

// Is it possible the animation `ease: [0.23, 1, 0.32, 1]` or `delay: index * 0.04` causes issues?
