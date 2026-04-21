// web/src/components/downloads/MiscDownloadsSection.tsx

import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useState } from 'react';
import type { Download } from '@/lib/api/downloads';
import { EpisodeRowMisc } from './episode-rows/EpisodeRowMisc';

interface Props {
  downloads: Download[];
  onDelete: (gid: string) => void;
}

export function MiscDownloadsSection({ downloads, onDelete }: Props) {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);
  if (downloads.length === 0) return null;
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-[11px] text-white/20 hover:text-white/60 uppercase tracking-[0.08em] cursor-pointer"
      >
        <HugeiconsIcon icon={open ? ArrowUp01Icon : ArrowDown01Icon} size={10} />
        <span>
          {i18n._(msg`downloads.miscHeader`)} ({downloads.length})
        </span>
      </button>
      {open && (
        <div className="mt-2 flex flex-col">
          {downloads.map((d) => {
            const percent =
              d.total_bytes > 0
                ? Math.min(100, Math.round((d.completed_bytes / d.total_bytes) * 100))
                : 0;
            return (
              <EpisodeRowMisc
                key={d.gid}
                gid={d.gid}
                filename={d.name}
                downloadedBytes={d.completed_bytes}
                totalBytes={d.total_bytes}
                percent={percent}
                status={d.status === 'complete' ? 'complete' : 'active'}
                onDelete={onDelete}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
