import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { renameApi } from '@/lib/api/rename';
import { libraryKeys } from '@/lib/api/library';

interface Props {
  libraryId: string;
  initialTemplate: string;
  initialAuto: boolean;
}

export function RenameConfigEditor({ libraryId, initialTemplate, initialAuto }: Props) {
  const { i18n } = useLingui();
  const qc = useQueryClient();
  const [template, setTemplate] = useState(initialTemplate);
  const [auto, setAuto] = useState(initialAuto);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => renameApi.setConfig(libraryId, template, auto),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: libraryKeys.detail(libraryId) });
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
  });

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
      <h3 className="text-sm font-semibold text-white/80">
        {i18n._(msg`Rename template`)}
      </h3>
      <textarea
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
        className="min-h-[96px] w-full rounded border border-white/10 bg-black/60 p-2 font-mono text-xs text-white/90"
        placeholder="{{.Title}} ({{.Year}})/S{{pad .Season 2}}E{{pad .EpisodeNumber 2}}.{{.Ext}}"
      />
      <label className="flex cursor-pointer items-center gap-2 text-sm text-white/70">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => setAuto(e.target.checked)}
          className="h-4 w-4"
        />
        {i18n._(msg`Auto-rename on match`)}
      </label>
      {error && <div className="text-xs text-red-400">{error}</div>}
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20 disabled:opacity-50"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {i18n._(msg`Save`)}
        </button>
        <a
          href={`/libraries/${libraryId}/rename`}
          className="rounded bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20"
        >
          {i18n._(msg`Preview`)}
        </a>
        <a
          href={`/libraries/${libraryId}/rename/history`}
          className="rounded bg-white/10 px-3 py-1 text-sm text-white/70 hover:bg-white/20"
        >
          {i18n._(msg`History`)}
        </a>
      </div>
    </div>
  );
}
