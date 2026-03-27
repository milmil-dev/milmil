import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { type AnimeSummary, discoverApi, discoverKeys } from '../lib/api/discover';
import { animeGradient } from '../lib/gradient';
import { EpisodeListItem } from './EpisodeListItem';
import { Modal } from './Modal';
import { Skeleton } from './Skeleton';

interface PreviewModalProps {
  anime: AnimeSummary | null;
  open: boolean;
  onClose: () => void;
}

export function PreviewModal({ anime, open, onClose }: PreviewModalProps) {
  const { i18n } = useLingui();
  const numericId = anime?.bangumi_id ?? 0;

  // Fetch full detail + episodes when modal opens (like Seanime)
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: discoverKeys.detail(numericId),
    queryFn: () => discoverApi.detail(numericId),
    enabled: open && numericId > 0,
  });

  const { data: episodes = [] } = useQuery({
    queryKey: discoverKeys.episodes(numericId),
    queryFn: () => discoverApi.episodes(numericId),
    enabled: open && numericId > 0,
  });

  if (!anime) return null;

  const info = detail || anime;
  const hasBanner = (detail?.banner_image || anime.banner_image)?.startsWith('http');
  const bannerSrc = detail?.banner_image || anime.banner_image || anime.cover_image;
  const hasCover = anime.cover_image?.startsWith('http');
  const synopsis = detail?.synopsis || anime.description;
  const tags = detail?.tags || [];
  const genres = anime.genres || [];

  return (
    <Modal open={open} onClose={onClose} size="lg">
      {/* Banner — Seanime style with gradient overlays */}
      <div className="relative -mx-5 -mt-5 h-[220px] lg:h-[260px] overflow-hidden">
        {detailLoading ? (
          <Skeleton className="w-full h-full rounded-none" />
        ) : (
          <>
            {bannerSrc?.startsWith('http') ? (
              <img
                src={bannerSrc}
                alt=""
                className="w-full h-full object-cover object-center"
                style={!hasBanner ? { filter: 'blur(16px) brightness(0.3)', transform: 'scale(1.2)' } : undefined}
              />
            ) : (
              <div className="w-full h-full" style={{ background: animeGradient(anime.title) }} />
            )}
            {/* Bottom gradient */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,10,10,1) 0%, rgba(10,10,10,0.6) 40%, transparent 70%)' }} />
          </>
        )}

        {/* Cover poster + title overlaid at bottom */}
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-4 flex items-end gap-4">
          {hasCover && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="shrink-0 w-[90px] h-[125px] rounded-md overflow-hidden shadow-md"
            >
              <img src={anime.cover_image} alt={anime.title} className="w-full h-full object-cover" />
            </motion.div>
          )}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="min-w-0 flex-1"
          >
            <h2 className="text-lg lg:text-xl font-bold text-white leading-tight line-clamp-2">
              {info.title}
            </h2>
            {info.title_original && info.title_original !== info.title && (
              <p className="text-[11px] text-white/40 mt-0.5 truncate">{info.title_original}</p>
            )}
          </motion.div>
        </div>
      </div>

      {/* Content */}
      <div className="pt-4 space-y-4">
        {/* Score + meta */}
        <div className="flex items-center gap-3 flex-wrap">
          {info.score > 0 && (
            <span className="text-[14px] font-bold text-mm-accent">♡ {info.score.toFixed(1)}</span>
          )}
          {detail?.rating && detail.rating.total > 0 && (
            <span className="text-[11px] text-white/40">{detail.rating.total} {i18n._(msg`anime.ratings`)}</span>
          )}
          {info.episode_count > 0 && (
            <span className="text-[11px] text-white/40">{info.episode_count} {i18n._(msg`common.ep`)}</span>
          )}
        </div>

        {/* Genres + tags */}
        {(genres.length > 0 || tags.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {genres.map((g) => (
              <span key={g} className="text-[11px] font-medium px-2 py-0.5 rounded bg-white/[0.06] text-white/60">{g}</span>
            ))}
            {tags.slice(0, 6).map((t) => (
              <span key={t} className="text-[11px] font-medium px-2 py-0.5 rounded bg-white/[0.04] text-white/40">{t}</span>
            ))}
          </div>
        )}

        {/* Synopsis */}
        {synopsis && (
          <p className="text-[13px] text-white/60 leading-relaxed max-h-[120px] overflow-y-auto">
            {synopsis.replace(/<[^>]+>/g, '')}
          </p>
        )}

        {/* Actions — Seanime: "Open page" + trailer + AniList link */}
        <div className="flex items-center gap-3 pt-1">
          <Link
            to={`/anime/${anime.bangumi_id}` as string}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-[13px] font-bold rounded-md bg-white text-black hover:bg-white/90 transition-colors cursor-pointer"
          >
            {i18n._(msg`hero.details`)}
          </Link>
          {anime.anilist_id && (
            <a
              href={`https://anilist.co/anime/${anime.anilist_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 text-[12px] rounded-md bg-white/[0.06] text-white/60 hover:bg-white/[0.1] transition-colors cursor-pointer"
            >
              AniList ↗
            </a>
          )}
        </div>

        {/* Episode list — compact, like Seanime maxCol={2} */}
        {episodes.length > 0 && (
          <div className="pt-2">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/30 mb-2">
              {i18n._(msg`anime.episodes`)} ({episodes.length})
            </h3>
            <div className="max-h-[200px] overflow-y-auto space-y-0.5 rounded-lg bg-white/[0.02] p-1">
              {episodes.slice(0, 20).map((ep) => (
                <EpisodeListItem
                  key={ep.bangumi_episode_id}
                  sort={ep.sort % 1 === 0 ? Math.floor(ep.sort) : ep.sort}
                  title={ep.title}
                  isActive={false}
                  href={`/anime/${anime.bangumi_id}`}
                  airDate={ep.air_date}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
