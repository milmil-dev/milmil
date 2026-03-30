import { ViewIcon, ViewOffSlashIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import * as React from 'react';
import { cn } from '@/lib/utils';

function PasswordInput({ className, type, ...props }: React.ComponentProps<'input'>) {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <div className="relative w-full">
      <input
        type={showPassword ? 'text' : 'password'}
        data-slot="input"
        className={cn(
          'h-10 w-full min-w-0 rounded-lg border border-mm-border bg-mm-surface px-3 py-2 pr-10 text-base text-white/90 shadow-sm transition-all duration-200 outline-none selection:bg-mm-accent/30 selection:text-white placeholder:text-white/40 hover:bg-mm-surface-hover hover:border-mm-border-subtle focus-visible:border-mm-accent/50 focus-visible:bg-mm-surface-hover focus-visible:ring-[3px] focus-visible:ring-mm-accent/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          'aria-invalid:border-red-500/50 aria-invalid:ring-red-500/20',
          className
        )}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShowPassword((prev) => !prev)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/90 transition-colors outline-none focus-visible:text-mm-accent focus-visible:ring-2 focus-visible:ring-mm-accent/30 rounded-sm flex items-center justify-center"
        aria-label={showPassword ? 'Hide password' : 'Show password'}
      >
        {showPassword ? (
          <HugeiconsIcon icon={ViewOffSlashIcon} className="h-4 w-4" aria-hidden="true" />
        ) : (
          <HugeiconsIcon icon={ViewIcon} className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export { PasswordInput };
