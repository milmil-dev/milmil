import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useState } from 'react';
import type { BangumiComment } from '@/lib/api/discover';

interface BangumiCommentsProps {
  comments: BangumiComment[] | undefined;
  isLoading: boolean;
}

const INITIAL_COUNT = 5;

export function BangumiComments({ comments, isLoading }: BangumiCommentsProps) {
  const { i18n } = useLingui();
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="mt-4">
        <div className="h-4 w-16 bg-ink/[0.06] rounded animate-pulse mb-3" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-ink/[0.06] animate-pulse shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3 w-20 bg-ink/[0.06] rounded animate-pulse" />
                <div className="h-3 w-full bg-ink/[0.06] rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!comments || comments.length === 0) return null;

  const visible = expanded ? comments : comments.slice(0, INITIAL_COUNT);

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-mm-text-primary mb-3">
        {i18n._(msg`watch.comments`)} ({comments.length})
      </h3>
      <div className="space-y-3">
        {visible.map((c) => (
          <div key={c.id} className="flex gap-2">
            {c.avatar ? (
              <img src={c.avatar} alt="" className="w-7 h-7 rounded-full shrink-0 object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-ink/[0.08] shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-[11px] text-mm-text-secondary">
                {c.nickname || c.username}
                {c.rate > 0 && <span className="ml-1.5 text-amber-400">★ {c.rate}</span>}
              </div>
              <p className="text-xs text-mm-text-secondary mt-0.5 line-clamp-3 leading-relaxed">
                {c.comment}
              </p>
            </div>
          </div>
        ))}
      </div>
      {comments.length > INITIAL_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs text-mm-text-tertiary hover:text-mm-text-secondary transition-colors w-full text-center py-1"
        >
          {expanded ? i18n._(msg`watch.showLess`) : i18n._(msg`watch.showMore`)}
        </button>
      )}
    </div>
  );
}
