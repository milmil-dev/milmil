import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { type AnimeSummary, discoverApi, discoverKeys, type Episode } from '../lib/api/discover';
import { libraryApi, libraryKeys, type MediaFileEntry } from '../lib/api/library';
import { cn } from '../lib/utils';
import { Modal } from './Modal';
import { Skeleton } from './Skeleton';
import { Button } from './ui/button';

interface MatchModalProps {
  file: MediaFileEntry | null;
  onClose: () => void;
  libraryId: string;
}

export function MatchModal({ file, onClose, libraryId }: MatchModalProps) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedAnime, setSelectedAnime] = useState<AnimeSummary | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

  // Reset state when file changes (modal opens/closes)
  useEffect(() => {
    if (file) {
      setStep(1);
      setSearchInput('');
      setDebouncedSearch('');
      setSelectedAnime(null);
      setSelectedEpisode(null);
    }
  }, [file]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Search anime query
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: discoverKeys.search(debouncedSearch),
    queryFn: () => discoverApi.search(debouncedSearch),
    enabled: debouncedSearch.length > 0,
  });

  // Episodes query
  const { data: episodes, isLoading: isLoadingEpisodes } = useQuery({
    queryKey: discoverKeys.episodes(selectedAnime?.bangumi_id ?? 0),
    queryFn: () => discoverApi.episodes(selectedAnime!.bangumi_id),
    enabled: !!selectedAnime && step === 2,
  });

  // Match mutation
  const matchMutation = useMutation({
    mutationFn: () => {
      if (!file || !selectedAnime || !selectedEpisode) throw new Error('Missing data');
      return libraryApi.matchFile(file.id, {
        bangumi_id: selectedAnime.bangumi_id,
        episode_id: selectedEpisode.bangumi_episode_id,
      });
    },
    onSuccess: () => {
      toast.success(i18n._(msg`library.detail.matchModal.matched`));
      queryClient.invalidateQueries({
        queryKey: libraryKeys.mediaFiles(libraryId),
      });
      queryClient.invalidateQueries({ queryKey: libraryKeys.detail(libraryId) });
      queryClient.invalidateQueries({ queryKey: libraryKeys.fileTree(libraryId) });
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleSelectAnime = (anime: AnimeSummary) => {
    setSelectedAnime(anime);
    setSelectedEpisode(null);
    setStep(2);
  };

  const handleGoBackToSearch = () => {
    setStep(1);
    setSelectedAnime(null);
    setSelectedEpisode(null);
  };

  return (
    <Modal
      open={!!file}
      onClose={onClose}
      title={i18n._(msg`library.detail.matchModal.title`)}
      size="lg"
    >
      {/* Filename banner */}
      {file && (
        <motion.div
          className="mb-5 rounded-lg bg-white/[0.04] border border-white/[0.06] px-4 py-2.5"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
        >
          <p className="font-mono text-xs text-white/50 truncate" title={file.filename}>
            {file.filename}
          </p>
        </motion.div>
      )}

      {/* Step indicator */}
      <motion.div
        className="flex items-center gap-2 mb-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        <div className="flex items-center gap-1.5">
          <motion.div
            className="w-1.5 h-1.5 rounded-full"
            animate={{
              backgroundColor: step === 1 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)',
              scale: step === 1 ? 1.2 : 1,
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          />
          <motion.div
            className="w-6 h-px"
            animate={{
              backgroundColor: step === 2 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.06)',
            }}
            transition={{ duration: 0.3 }}
          />
          <motion.div
            className="w-1.5 h-1.5 rounded-full"
            animate={{
              backgroundColor: step === 2 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)',
              scale: step === 2 ? 1.2 : 1,
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          />
        </div>
        <span className="text-[11px] text-white/25 ml-1">
          {step === 1
            ? i18n._(msg`library.detail.matchModal.stepSearch`)
            : i18n._(msg`library.detail.matchModal.stepEpisode`)}
        </span>
      </motion.div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step-search"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {/* Search input */}
            <div className="relative mb-4">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={i18n._(msg`library.detail.matchModal.searchPlaceholder`)}
                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/[0.12] transition-colors"
                autoFocus
              />
            </div>

            {/* Results */}
            {!debouncedSearch && (
              <motion.p
                className="text-center text-[13px] text-white/20 py-12"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                {i18n._(msg`library.detail.matchModal.searchHint`)}
              </motion.p>
            )}

            {isSearching && (
              <div className="space-y-2 py-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
                ))}
              </div>
            )}

            {debouncedSearch && !isSearching && searchResults && searchResults.length === 0 && (
              <motion.p
                className="text-center text-[13px] text-white/20 py-12"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                {i18n._(msg`library.detail.matchModal.noResults`)}
              </motion.p>
            )}

            {searchResults && searchResults.length > 0 && (
              <div className="space-y-1 max-h-[45vh] overflow-y-auto pr-1">
                {searchResults.map((anime, index) => (
                  <motion.button
                    key={anime.bangumi_id}
                    type="button"
                    onClick={() => handleSelectAnime(anime)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg cursor-pointer text-left group"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.25,
                      delay: Math.min(index * 0.04, 0.4),
                      ease: 'easeOut',
                    }}
                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <img
                      src={anime.cover_image}
                      alt={anime.title}
                      className="w-12 h-16 object-cover rounded-md flex-shrink-0 ring-1 ring-white/[0.06]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white/80 group-hover:text-white truncate transition-colors">
                        {anime.title}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-white/30 mt-1">
                        <span>
                          {anime.episode_count} {i18n._(msg`common.ep`)}
                        </span>
                        {anime.score > 0 && (
                          <span className="text-amber-400/60">{anime.score.toFixed(1)}</span>
                        )}
                      </div>
                    </div>
                    <svg
                      className="w-4 h-4 text-white/10 group-hover:text-white/30 transition-colors shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {step === 2 && selectedAnime && (
          <motion.div
            key="step-episode"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {/* Selected anime header */}
            <motion.div
              className="flex items-center gap-3 mb-4 pb-4 border-b border-white/[0.06]"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <img
                src={selectedAnime.cover_image}
                alt={selectedAnime.title}
                className="w-12 h-16 object-cover rounded-md flex-shrink-0 ring-1 ring-white/[0.06]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{selectedAnime.title}</p>
                <button
                  type="button"
                  onClick={handleGoBackToSearch}
                  className="flex items-center gap-1 text-[12px] text-white/30 hover:text-white/60 transition-colors mt-1 cursor-pointer"
                >
                  <svg
                    className="w-3 h-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  {i18n._(msg`library.detail.matchModal.change`)}
                </button>
              </div>
            </motion.div>

            {/* Episode list */}
            {isLoadingEpisodes && (
              <div className="space-y-2 py-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-lg" />
                ))}
              </div>
            )}

            {episodes && episodes.length > 0 && (
              <div className="space-y-1 max-h-[35vh] overflow-y-auto pr-1 mb-5">
                {episodes.map((ep, index) => {
                  const isSelected =
                    selectedEpisode?.bangumi_episode_id === ep.bangumi_episode_id;
                  return (
                    <motion.button
                      key={ep.bangumi_episode_id}
                      type="button"
                      onClick={() => setSelectedEpisode(ep)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-left transition-colors',
                        isSelected
                          ? 'bg-white/[0.08] ring-1 ring-white/[0.12]'
                          : 'hover:bg-white/[0.04]'
                      )}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.2,
                        delay: Math.min(index * 0.025, 0.5),
                        ease: 'easeOut',
                      }}
                      whileTap={{ scale: 0.98 }}
                      layout
                    >
                      <motion.span
                        className="text-[12px] font-bold tabular-nums whitespace-nowrap"
                        animate={{
                          color: isSelected
                            ? 'rgba(255,255,255,0.8)'
                            : 'rgba(255,255,255,0.25)',
                        }}
                        transition={{ duration: 0.15 }}
                      >
                        EP {String(ep.sort).padStart(2, '0')}
                      </motion.span>
                      <span
                        className={cn(
                          'text-sm truncate flex-1 transition-colors',
                          isSelected ? 'text-white' : 'text-white/50'
                        )}
                      >
                        {ep.title || ep.title_original}
                      </span>
                      {ep.air_date && (
                        <span className="text-[11px] text-white/20 whitespace-nowrap">
                          {ep.air_date}
                        </span>
                      )}
                      {isSelected && (
                        <motion.svg
                          className="w-4 h-4 text-white/50 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </motion.svg>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            )}

            {episodes && episodes.length === 0 && !isLoadingEpisodes && (
              <motion.p
                className="text-center text-[13px] text-white/20 py-12"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {i18n._(msg`library.detail.matchModal.noEpisodes`)}
              </motion.p>
            )}

            {/* Confirm button */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Button
                type="button"
                onClick={() => matchMutation.mutate()}
                disabled={!selectedEpisode || matchMutation.isPending}
                className="w-full"
              >
                {matchMutation.isPending
                  ? i18n._(msg`common.loading`)
                  : i18n._(msg`library.detail.matchModal.confirm`)}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
