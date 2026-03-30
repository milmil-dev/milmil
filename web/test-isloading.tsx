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
      await sleep(100);
      return { items: [{ id: 1, name: 'File 1' }] };
    },
  });

  const files = data?.items || [];

  return (
    <div>
      isLoading: {isLoading ? 'true' : 'false'}
      <br />
      files length: {files.length}
      <br />
      show empty state: {!isLoading && files.length === 0 && !debouncedSearch ? 'true' : 'false'}
    </div>
  );
}

const queryClient = new QueryClient();
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TestComponent />
    </QueryClientProvider>
  );
}

console.log('Initial state:');
console.log(renderToString(<App />));
