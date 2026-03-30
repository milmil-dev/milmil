import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';

function TestApp() {
  const [data, setData] = useState([]);
  useEffect(() => {
    setData([{ id: 1, name: 'A' }]);
  }, []);

  return (
    <AnimatePresence initial={false}>
      {data.map((d) => (
        <motion.div key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {d.name}
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
console.log(renderToString(<TestApp />));
