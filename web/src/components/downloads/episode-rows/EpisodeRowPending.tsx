// web/src/components/downloads/episode-rows/EpisodeRowPending.tsx

import { Refresh03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';

interface Props {
  nextFetchRelative: string;
  onRefresh: () => void;
}

export function EpisodeRowPending({ nextFetchRelative, onRefresh }: Props) {
  const { i18n } = useLingui();
  return (
    <div className="grid grid-cols-[92px_1fr_auto] gap-5 items-center px-2 py-[9px]">
      <div className="text-center text-[10px] uppercase tracking-[0.08em] text-ink/25">
        {i18n._(msg`downloads.waiting`)}
      </div>
      <div className="text-[12px] text-ink/45">
        {i18n._(msg`downloads.nextFetch`)} ~{nextFetchRelative}
      </div>
      <button
        type="button"
        aria-label={i18n._(msg`downloads.refresh`)}
        onClick={onRefresh}
        className="text-ink/35 hover:text-ink/75"
      >
        <HugeiconsIcon icon={Refresh03Icon} size={12} />
      </button>
    </div>
  );
}
