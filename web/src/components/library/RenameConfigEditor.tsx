import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMemo } from 'react';

import { Switch } from '@/components/ui/switch';

interface Props {
  template: string;
  auto: boolean;
  onTemplateChange: (value: string) => void;
  onAutoChange: (value: boolean) => void;
}

const LABEL_CLS = 'text-[10px] font-bold uppercase tracking-[0.15em] text-white/35';

interface TemplateCheck {
  ok: boolean;
  error?: string;
  fields: string[];
}

function validateTemplate(t: string): TemplateCheck {
  if (!t.trim()) return { ok: true, fields: [] };

  const fields = new Set<string>();
  let i = 0;

  while (i < t.length) {
    if (t[i] === '{' && t[i + 1] === '{') {
      const start = i + 2;
      const end = t.indexOf('}}', start);
      if (end === -1) return { ok: false, error: '未閉合 {{', fields: [] };

      // Guard against nested {{ before a }}
      const nested = t.indexOf('{{', start);
      if (nested !== -1 && nested < end) return { ok: false, error: '巢狀 {{', fields: [] };

      const body = t.slice(start, end).trim();
      if (!body) return { ok: false, error: '空的 {{ }}', fields: [] };

      for (const tok of body.split(/\s+/)) {
        if (tok.startsWith('.')) fields.add(tok);
      }
      i = end + 2;
    } else if (t[i] === '}' && t[i + 1] === '}') {
      return { ok: false, error: '未配對 }}', fields: [] };
    } else {
      i++;
    }
  }

  return { ok: true, fields: [...fields] };
}

export function RenameConfigEditor({ template, auto, onTemplateChange, onAutoChange }: Props) {
  const { i18n } = useLingui();
  const check = useMemo(() => validateTemplate(template), [template]);

  return (
    <div className="space-y-3">
      <label htmlFor="rename-template" className={LABEL_CLS}>
        {i18n._(msg`library.rename.template`)}
      </label>

      <textarea
        id="rename-template"
        value={template}
        onChange={(e) => onTemplateChange(e.target.value)}
        placeholder="{{.Title}} ({{.Year}})/S{{pad .Season 2}}E{{pad .EpisodeNumber 2}}.{{.Ext}}"
        className="w-full min-h-[96px] rounded-lg bg-white/[0.04] px-4 py-3 font-mono text-xs text-white/85 placeholder:text-white/25 focus:outline-none focus:bg-white/[0.07] transition-colors resize-y"
      />

      {/* Verifier row */}
      {template.trim() && (
        <div className="flex items-start gap-2 px-1">
          {check.ok ? (
            <>
              <svg
                viewBox="0 0 20 20"
                fill="none"
                className="w-3.5 h-3.5 mt-0.5 text-emerald-400/80 shrink-0"
              >
                <path
                  d="M5 10.5l3 3 7-7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white/50">
                  {check.fields.length > 0
                    ? `${i18n._(msg`library.rename.fieldsDetected`)}: `
                    : i18n._(msg`library.rename.validEmpty`)}
                  {check.fields.length > 0 && (
                    <span className="font-mono text-white/70">{check.fields.join(', ')}</span>
                  )}
                </p>
              </div>
            </>
          ) : (
            <>
              <svg
                viewBox="0 0 20 20"
                fill="none"
                className="w-3.5 h-3.5 mt-0.5 text-red-400/80 shrink-0"
              >
                <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.3" />
                <path
                  d="M10 6v5M10 13.5v.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <p className="text-[11px] text-red-400/80">{check.error}</p>
            </>
          )}
        </div>
      )}

      <label className="flex items-center justify-between cursor-pointer select-none pt-1">
        <span className="text-sm text-white/65">{i18n._(msg`library.rename.autoOnMatch`)}</span>
        <Switch checked={auto} onCheckedChange={onAutoChange} />
      </label>
    </div>
  );
}
