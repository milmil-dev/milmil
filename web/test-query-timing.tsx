import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function TestComponent() {
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['test', debouncedSearch, page, perPage],
    queryFn: async () => {
      console.log('Query called with:', debouncedSearch, page, perPage);
      await sleep(100);
      return { items: [{ id: 1, name: 'File 1' }] };
    },
  });

  const files = data?.items || [];

  if (!isLoading && files.length === 0 && !debouncedSearch) {
    return <div>Empty State</div>;
  }

  return (
    <div>
      Loading: {isLoading ? 'T' : 'F'}, Fetching: {isFetching ? 'T' : 'F'}
      Files: {files.length}
    </div>
  );
}

const queryClient = new QueryClient();
const app = (
  <QueryClientProvider client={queryClient}>
    <TestComponent />
  </QueryClientProvider>
);
console.log(renderToString(app));
