import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SettingsCardProps {
  label?: string;
  children: ReactNode;
  className?: string;
}

export function SettingsCard({ label, children, className }: SettingsCardProps) {
  return (
    <div
      className={cn(
        'rounded-[10px] border border-white/[0.06] bg-white/[0.025] p-3 sm:p-4 sm:px-5',
        className
      )}
    >
      {label && (
        <div className="mb-3 text-xs font-semibold uppercase tracking-[1px] text-white/50">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}
