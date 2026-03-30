import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';

function App() {
  const [data, setData] = useState([1, 2, 3]);

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {data.map((id) => (
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
  );
}

console.log(renderToString(<App />));
