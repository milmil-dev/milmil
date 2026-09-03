import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { discoverApi } from '../lib/api/discover';
import { translateGenre } from '../lib/genre-i18n';
import { GENRES } from '../lib/genres';

/* Fallback when /discover/tags/popular has nothing yet — well-known Bangumi
   tags, always searchable via Bangumi's SearchByTag API */
const FALLBACK_TAGS = [
  '漫畫改編',
  '輕小說改編',
  '原創',
  '遊戲改編',
  '續篇',
  '異世界',
  '校園',
  '日常',
  '戰鬥',
  '後宮',
  '百合',
  '機戰',
  '偶像',
  '治癒',
  '搞笑',
  '致鬱',
  '懸疑',
  '熱血',
  '運動',
  '美食',
];

/** AniList genre chips + Bangumi hot tags under the Home hero. */
export function HotTagsSection({ delay = 0.2 }: { delay?: number }) {
  const { i18n } = useLingui();

  const { data: hotTags = [] } = useQuery({
    queryKey: ['discover', 'hotTags'],
    queryFn: () => discoverApi.hotTags(),
    staleTime: 10 * 60 * 1000,
  });
  // `name` is the search term Bangumi understands; `display` is the server's
  // rendering of it in the UI language (the tag vocabulary is zh-Hant).
  const tags =
    hotTags.length > 0
      ? hotTags.slice(0, 20).map((t) => ({ name: t.name, label: t.display ?? t.name }))
      : FALLBACK_TAGS.map((name) => ({ name, label: name }));

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.3 }}
      className="space-y-3"
      data-testid="home-hot-tags"
    >
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {GENRES.map((genre) => (
          <Link
            key={genre}
            to="/search"
            search={{ genre } as never}
            className="shrink-0 px-3 py-1.5 text-[12px] font-semibold rounded-md bg-ink/[0.04] text-ink/40 hover:bg-ink/[0.08] hover:text-ink/70 transition-colors cursor-pointer"
          >
            {translateGenre(genre, i18n.locale)}
          </Link>
        ))}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {tags.map((tag) => (
          <Link
            key={tag.name}
            to="/search"
            search={{ tag: tag.name } as never}
            className="shrink-0 px-2.5 py-1 text-[11px] font-medium rounded bg-ink/[0.03] text-ink/25 hover:bg-ink/[0.06] hover:text-ink/50 transition-colors cursor-pointer"
          >
            {tag.label}
          </Link>
        ))}
      </div>
    </motion.section>
  );
}
