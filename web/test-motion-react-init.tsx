import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';

function App() {
  const [data, setData] = useState([1, 2, 3]);

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {data.map((id) => (
        <motion.div key={id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {id}
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

console.log(renderToString(<App />));
