import { JSDOM } from 'jsdom';
import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

const dom = new JSDOM('<!DOCTYPE html><div id="root"></div>', {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
global.window = dom.window as any;
global.document = dom.window.document as any;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = clearTimeout;
global.window.requestAnimationFrame = global.requestAnimationFrame;

function MotionTable() {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    setTimeout(() => {
      setData([{ id: 1, name: 'File 1' }]);
    }, 100);
  }, []);

  return (
    <AnimatePresence>
      {data.map((row: any) => (
        <motion.div key={row.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {row.name}
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<MotionTable />);

setTimeout(() => {
  console.log('After 500ms DOM:', document.getElementById('root')!.innerHTML);
  process.exit(0);
}, 500);
