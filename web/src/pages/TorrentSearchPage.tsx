import { MagnetIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageTransition } from '../components/PageTransition';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { torrentApi, torrentKeys } from '../lib/api/torrent';

export function TorrentSearchPage() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  // Debounce 500ms
  useEffect(() => {
    if (!input.trim()) {
      setQuery('');
      return;
    }
    const timer = setTimeout(() => setQuery(input.trim()), 500);
    return () => clearTimeout(timer);
  }, [input]);

  const { data: results = [], isLoading } = useQuery({
    queryKey: torrentKeys.search(query),
    queryFn: () => torrentApi.search(query),
    enabled: query.length > 0,
  });

  const addMutation = useMutation({
    mutationFn: (item: { url: string; name: string }) => torrentApi.add(item),
    onSuccess: () => toast.success('Download added'),
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <PageTransition>
      <div className="min-h-screen px-6 pt-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-6"
        >
          <HugeiconsIcon icon={MagnetIcon} size={22} className="text-mm-accent" />
          <h1 className="text-lg font-bold text-white tracking-tight">Torrent Search</h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <Input
            placeholder="Search Nyaa..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="bg-mm-surface border-mm-border text-white placeholder:text-mm-text-tertiary"
          />
        </motion.div>

        {isLoading && query && <p className="text-sm text-mm-text-secondary">Searching...</p>}

        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="space-y-2"
          >
            {results.map((item, i) => (
              <motion.div
                key={`${item.Link}-${i}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-start gap-3 p-3 rounded bg-mm-surface"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white break-words">{item.Title}</p>
                  {item.PubDate && (
                    <p className="text-[11px] mt-1 text-mm-text-tertiary">
                      {new Date(item.PubDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={addMutation.isPending}
                  onClick={() => addMutation.mutate({ url: item.Link, name: item.Title })}
                  className="shrink-0 text-[11px]"
                >
                  Download
                </Button>
              </motion.div>
            ))}
          </motion.div>
        )}

        {query && !isLoading && results.length === 0 && (
          <p className="text-sm text-mm-text-secondary">No results found.</p>
        )}
      </div>
    </PageTransition>
  );
}
