import React, { useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';

function App() {
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    console.log('Setting timeout for search', search);
    const timer = setTimeout(() => {
      console.log('Timeout fired for search', search);
      setDebouncedSearch(search);
    }, 300);
    return () => {
      console.log('Clearing timeout for search', search);
      clearTimeout(timer);
    };
  }, [search]);

  return <div>debouncedSearch: {debouncedSearch}</div>;
}

const html = renderToString(<App />);
console.log('SSR HTML:', html);
