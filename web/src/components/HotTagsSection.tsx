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

/** Fallback tag labels for non zh-Hant UIs; the search term stays the Bangumi tag. */
const FALLBACK_TAG_LABELS: Record<string, Record<string, string>> = {
  漫畫改編: { en: 'Manga', 'zh-CN': '漫画改编', ja: '漫画原作', ko: '만화 원작' },
  輕小說改編: { en: 'Light novel', 'zh-CN': '轻小说改编', ja: 'ラノベ原作', ko: '라노벨 원작' },
  原創: { en: 'Original', 'zh-CN': '原创', ja: 'オリジナル', ko: '오리지널' },
  遊戲改編: { en: 'Game', 'zh-CN': '游戏改编', ja: 'ゲーム原作', ko: '게임 원작' },
  續篇: { en: 'Sequel', 'zh-CN': '续篇', ja: '続編', ko: '속편' },
  異世界: { en: 'Isekai', 'zh-CN': '异世界', ja: '異世界', ko: '이세계' },
  校園: { en: 'School', 'zh-CN': '校园', ja: '学園', ko: '학원' },
  日常: { en: 'Slice of life', 'zh-CN': '日常', ja: '日常', ko: '일상' },
  戰鬥: { en: 'Battle', 'zh-CN': '战斗', ja: 'バトル', ko: '배틀' },
  後宮: { en: 'Harem', 'zh-CN': '后宫', ja: 'ハーレム', ko: '하렘' },
  百合: { en: 'Yuri', 'zh-CN': '百合', ja: '百合', ko: '백합' },
  機戰: { en: 'Mecha', 'zh-CN': '机战', ja: 'ロボット', ko: '메카' },
  偶像: { en: 'Idol', 'zh-CN': '偶像', ja: 'アイドル', ko: '아이돌' },
  治癒: { en: 'Healing', 'zh-CN': '治愈', ja: '癒し', ko: '힐링' },
  搞笑: { en: 'Comedy', 'zh-CN': '搞笑', ja: 'ギャグ', ko: '개그' },
  致鬱: { en: 'Tearjerker', 'zh-CN': '致郁', ja: '鬱展開', ko: '우울' },
  懸疑: { en: 'Mystery', 'zh-CN': '悬疑', ja: 'ミステリー', ko: '미스터리' },
  熱血: { en: 'Hot-blooded', 'zh-CN': '热血', ja: '熱血', ko: '열혈' },
  運動: { en: 'Sports', 'zh-CN': '运动', ja: 'スポーツ', ko: '스포츠' },
  美食: { en: 'Food', 'zh-CN': '美食', ja: 'グルメ', ko: '음식' },
};

/* Rows scroll sideways; fade the trailing edge so the overflow reads as "more". */
const ROW_FADE = {
  scrollbarWidth: 'none',
  maskImage: 'linear-gradient(to right, black calc(100% - 48px), transparent)',
  WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 48px), transparent)',
} as const;

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
      : FALLBACK_TAGS.map((name) => ({
          name,
          label: FALLBACK_TAG_LABELS[name]?.[i18n.locale] ?? name,
        }));

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.3 }}
      className="space-y-3"
      data-testid="home-hot-tags"
    >
      <div className="flex gap-2 overflow-x-auto pb-1 pr-12" style={ROW_FADE}>
        {GENRES.map((genre) => (
          <Link
            key={genre}
            to="/search"
            search={{ genre } as never}
            className="shrink-0 px-3 py-1.5 text-[12px] font-semibold rounded-md bg-ink/[0.04] text-ink/55 hover:bg-ink/[0.08] hover:text-ink/80 transition-colors cursor-pointer"
          >
            {translateGenre(genre, i18n.locale)}
          </Link>
        ))}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 pr-12" style={ROW_FADE}>
        {tags.map((tag) => (
          <Link
            key={tag.name}
            to="/search"
            search={{ tag: tag.name } as never}
            className="shrink-0 px-2.5 py-1 text-[11px] font-medium rounded bg-ink/[0.03] text-ink/45 hover:bg-ink/[0.06] hover:text-ink/70 transition-colors cursor-pointer"
          >
            {tag.label}
          </Link>
        ))}
      </div>
    </motion.section>
  );
}
