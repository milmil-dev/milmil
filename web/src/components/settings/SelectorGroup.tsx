import { cn } from '@/lib/utils';

interface SelectorGroupProps<T extends string | number> {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}

export function SelectorGroup<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: SelectorGroupProps<T>) {
  return (
    <fieldset className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          disabled={disabled}
          className={cn(
            'min-w-0 rounded px-3.5 py-1.5 text-xs font-semibold transition-colors',
            value === opt.value
              ? 'bg-ink/[0.10] text-ink'
              : 'bg-transparent text-mm-text-secondary hover:bg-ink/[0.04] hover:text-ink/70',
            disabled && 'opacity-50 pointer-events-none'
          )}
        >
          {opt.label}
        </button>
      ))}
    </fieldset>
  );
}
