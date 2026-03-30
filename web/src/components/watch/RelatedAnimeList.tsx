import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Link } from '@tanstack/react-router';
import type { RelatedAnime } from '@/lib/api/discover';

interface RelatedAnimeListProps {
  relations: RelatedAnime[] | undefined;
}

const RELATION_LABELS: Record<string, Record<string, string>> = {
  PREQUEL: { en: 'Prequel', 'zh-Hant': '前作', 'zh-Hans': '前作' },
  SEQUEL: { en: 'Sequel', 'zh-Hant': '續作', 'zh-Hans': '续作' },
  SIDE_STORY: { en: 'Side Story', 'zh-Hant': '番外篇', 'zh-Hans': '番外篇' },
  PARENT: { en: 'Parent', 'zh-Hant': '本篇', 'zh-Hans': '本篇' },
  ALTERNATIVE: { en: 'Alternative', 'zh-Hant': '替代版', 'zh-Hans': '替代版' },
  SPIN_OFF: { en: 'Spin-off', 'zh-Hant': '衍生作', 'zh-Hans': '衍生作' },
};

function getRelationLabel(type: string, locale: string): string {
  return RELATION_LABELS[type]?.[locale] ?? RELATION_LABELS[type]?.en ?? type.replace(/_/g, ' ');
}

const MAX_ITEMS = 5;

export function RelatedAnimeList({ relations }: RelatedAnimeListProps) {
  const { i18n } = useLingui();
  if (!relations || relations.length === 0) return null;

  const items = relations.slice(0, MAX_ITEMS);

  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold text-white/60 mb-2">{i18n._(msg`watch.related`)}</h3>
      <div className="space-y-2">
        {items.map((r) => (
          <Link
            key={r.anime.bangumi_id}
            to="/watch/$animeId"
            params={{ animeId: String(r.anime.bangumi_id) }}
            className="flex gap-2 rounded p-1 hover:bg-white/[0.04] transition-colors group"
          >
            {r.anime.cover_image ? (
              <img src={r.anime.cover_image} alt="" className="w-16 h-10 rounded object-cover shrink-0" />
            ) : (
              <div className="w-16 h-10 rounded bg-white/[0.06] shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-[11px] text-white/60 line-clamp-2 leading-tight group-hover:text-white/80">{r.anime.title}</p>
              <p className="text-[10px] text-white/30 mt-0.5">{getRelationLabel(r.relation_type, i18n.locale)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
