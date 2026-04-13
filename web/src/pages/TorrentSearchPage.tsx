import { MagnetIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageTransition } from '../components/PageTransition';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useDocumentTitle } from '../hooks/use-document-title';
import type { TorrentResult } from '../lib/api/torrent';
import { torrentApi, torrentKeys } from '../lib/api/torrent';

const SOURCE_LABELS: Record<string, string> = {
  all: 'All',
  nyaa: 'Nyaa',
  dmhy: 'DMHY',
  mikan: 'Mikan',
  'bangumi.moe': 'Bangumi.moe',
  'acg.rip': 'ACG.RIP',
  dandanplay: 'DanDanPlay',
};

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    nyaa: 'bg-green-500/15 text-green-400',
    dmhy: 'bg-blue-500/15 text-blue-400',
    mikan: 'bg-orange-500/15 text-orange-400',
    'bangumi.moe': 'bg-pink-500/15 text-pink-400',
    'acg.rip': 'bg-purple-500/15 text-purple-400',
    dandanplay: 'bg-cyan-500/15 text-cyan-400',
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[source] ?? 'bg-white/10 text-white/60'}`}
    >
      {SOURCE_LABELS[source] ?? source}
    </span>
  );
}

export function TorrentSearchPage() {
  useDocumentTitle('Torrent Search');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');

  useEffect(() => {
    if (!input.trim()) {
      setQuery('');
      return;
    }
    const timer = setTimeout(() => setQuery(input.trim()), 500);
    return () => clearTimeout(timer);
  }, [input]);

  const { data: results = [], isLoading } = useQuery({
    queryKey: torrentKeys.search(query, source),
    queryFn: () => torrentApi.search(query, source === 'all' ? undefined : source),
    enabled: query.length > 0,
  });

  const addMutation = useMutation({
    mutationFn: (item: { url: string; name: string }) => torrentApi.add(item),
    onSuccess: () => toast.success('Download added'),
    onError: (err: Error) => toast.error(err.message),
  });

  const downloadURL = (item: TorrentResult) => item.magnet || item.torrent_url;

  const sources = ['all', 'nyaa', 'dmhy', 'mikan', 'bangumi.moe', 'acg.rip', 'dandanplay'];

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

        {/* Search input */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-4"
        >
          <Input
            placeholder="Search across all sources..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="bg-mm-surface border-mm-border text-white placeholder:text-mm-text-tertiary"
          />
        </motion.div>

        {/* Source tabs */}
        <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1 scrollbar-none">
          {sources.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                source === s
                  ? 'bg-white/[0.12] text-white'
                  : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
              }`}
            >
              {SOURCE_LABELS[s] ?? s}
            </button>
          ))}
        </div>

        {isLoading && query && <p className="text-sm text-mm-text-secondary">Searching...</p>}

        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="space-y-1.5"
          >
            {results.map((item, i) => (
              <motion.div
                key={`${item.info_hash || item.torrent_url || item.magnet}-${i}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.5) }}
                className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white break-words leading-relaxed">
                    {item.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <SourceBadge source={item.source_site} />
                    {item.sub_group && (
                      <span className="text-[10px] text-white/30">{item.sub_group}</span>
                    )}
                    {item.size && <span className="text-[10px] text-white/25">{item.size}</span>}
                    {item.seeders > 0 && (
                      <span className="text-[10px] text-green-400/70">
                        ↑{item.seeders}
                      </span>
                    )}
                    {item.leechers > 0 && (
                      <span className="text-[10px] text-red-400/50">
                        ↓{item.leechers}
                      </span>
                    )}
                    {item.publish_date && (
                      <span className="text-[10px] text-white/20">
                        {new Date(item.publish_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={addMutation.isPending || !downloadURL(item)}
                  onClick={() =>
                    addMutation.mutate({ url: downloadURL(item), name: item.title })
                  }
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
