import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function TestComponent() {
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['test', debouncedSearch],
    queryFn: async () => {
      console.log('Fetching query...');
      await sleep(100);
      return { items: [{ id: 1, name: 'File 1' }] };
    },
  });

  const files = data?.items || [];
  console.log(
    'Render: isLoading =',
    isLoading,
    ', files.length =',
    files.length,
    ', debouncedSearch =',
    debouncedSearch
  );

  if (!isLoading && files.length === 0 && !debouncedSearch) {
    console.log('Rendering EMPTY STATE!');
    return <div>Empty State</div>;
  }

  return <div>{isLoading ? 'Loading...' : 'Loaded: ' + files.length}</div>;
}

const queryClient = new QueryClient();
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TestComponent />
    </QueryClientProvider>
  );
}

console.log(renderToString(<App />));
