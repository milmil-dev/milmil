import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';

interface HistoryBatchBarProps {
  selectedCount: number;
  onDeleteSelected: () => void;
  onCancel: () => void;
}

export function HistoryBatchBar({
  selectedCount,
  onDeleteSelected,
  onCancel,
}: HistoryBatchBarProps) {
  const { i18n } = useLingui();
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-[rgba(10,10,10,0.85)] backdrop-blur md:left-20">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-6 py-3">
        <span className="text-[13px] text-white/70">{selectedCount} selected</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-md bg-white/[0.05] px-4 py-1.5 text-[13px] font-medium text-white/70 hover:bg-white/[0.08] hover:text-white"
        >
          {i18n._(msg`history.batch.cancel`)}
        </button>
        <button
          type="button"
          onClick={onDeleteSelected}
          disabled={selectedCount === 0}
          className="cursor-pointer rounded-md bg-red-500/[0.15] px-4 py-1.5 text-[13px] font-medium text-red-300 transition-colors hover:bg-red-500/[0.25] disabled:opacity-30"
        >
          {i18n._(msg`history.batch.deleteSelected`)}
        </button>
      </div>
    </div>
  );
}
