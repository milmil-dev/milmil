import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';

const queryClient = new QueryClient();

function TestComponent() {
  const { data, isLoading } = useQuery({
    queryKey: ['test'],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 100));
      return { items: [{ id: 1, name: 'File 1' }] };
    },
  });

  const files = data?.items || [];

  if (!isLoading && files.length === 0) {
    return <div>Empty State</div>;
  }

  return <div>{isLoading ? 'Loading...' : 'Loaded: ' + files.length}</div>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TestComponent />
    </QueryClientProvider>
  );
}

console.log(renderToString(<App />));
