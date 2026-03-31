import { cn } from '@/lib/utils';

interface ConnectionBadgeProps {
  connected: boolean;
  connectedText: string;
  disconnectedText: string;
}

export function ConnectionBadge({ connected, connectedText, disconnectedText }: ConnectionBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          connected ? 'bg-green-400' : 'bg-white/15'
        )}
      />
      <span className={connected ? 'text-green-400' : 'text-white/40'}>
        {connected ? connectedText : disconnectedText}
      </span>
    </span>
  );
}
