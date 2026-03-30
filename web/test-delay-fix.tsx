import React, { useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';

function App() {
  const [items, setItems] = useState<number[]>([]);
  useEffect(() => {
    setItems([1, 2, 3]);
  }, []);
  return (
    <div>
      {items.map((i) => (
        <span key={i}>{i}</span>
      ))}
    </div>
  );
}

console.log(renderToString(<App />));
