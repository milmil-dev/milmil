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
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          disabled={disabled}
          className={cn(
            'rounded px-3.5 py-1.5 text-[11px] font-semibold transition-colors border',
            value === opt.value
              ? 'bg-mm-accent text-black border-mm-accent'
              : 'bg-transparent text-mm-text-secondary border-white/[0.08] hover:border-white/20',
            disabled && 'opacity-50 pointer-events-none'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
