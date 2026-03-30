import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function TestComponent() {
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [search, setSearch] = useState('a'); // Initially "a" but debouncedSearch is ""

  // This simulates the behavior in LibraryDetailPage where search="" and debouncedSearch=""
  // but if search="", why would debouncedSearch differ?

  const { data, isLoading } = useQuery({
    queryKey: ['test', debouncedSearch],
    queryFn: async () => {
      await sleep(100);
      return { items: [{ id: 1, name: 'File 1' }] };
    },
  });

  const files = data?.items || [];

  if (!isLoading && files.length === 0 && !debouncedSearch) {
    return <div>Empty State</div>;
  }

  return <div>Normal State</div>;
}

const queryClient = new QueryClient();
const app = (
  <QueryClientProvider client={queryClient}>
    <TestComponent />
  </QueryClientProvider>
);
console.log(renderToString(app));
