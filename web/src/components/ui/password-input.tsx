import { ViewIcon, ViewOffSlashIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import * as React from 'react';
import { cn } from '@/lib/utils';

const baseFieldClass =
  'w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1 pr-10 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 aria-invalid:border-red-500/50 aria-invalid:ring-red-500/20';

const sharedInputProps = {
  autoComplete: 'off' as const,
  spellCheck: false,
  'data-1p-ignore': '',
  'data-lpignore': 'true',
  'data-slot': 'input',
};

type CommonProps = {
  className?: string;
};

type SingleLineProps = CommonProps &
  Omit<React.ComponentProps<'input'>, 'type'> & {
    multiline?: false;
  };

type MultiLineProps = CommonProps &
  React.ComponentProps<'textarea'> & {
    multiline: true;
    /** Visible row count when expanded. Defaults to 3. */
    rows?: number;
  };

type PasswordInputProps = SingleLineProps | MultiLineProps;

/**
 * Masks input via the show/hide toggle. Pass `multiline` for long secrets
 * like JWT-style tokens — masking uses `-webkit-text-security: disc`, which
 * is supported in Chromium/Safari. Firefox falls back to plain text while
 * the toggle is off, since `<textarea>` has no native type="password".
 */
function PasswordInput(props: PasswordInputProps) {
  const [showPassword, setShowPassword] = React.useState(false);
  const masked = !showPassword;
  const toggle = (
    <button
      type="button"
      onClick={() => setShowPassword((prev) => !prev)}
      className={cn(
        'absolute right-3 text-ink/40 hover:text-ink/90 transition-colors outline-none focus-visible:text-mm-accent focus-visible:ring-2 focus-visible:ring-mm-accent/30 rounded-sm flex items-center justify-center',
        props.multiline ? 'top-2.5' : 'top-1/2 -translate-y-1/2'
      )}
      aria-label={showPassword ? 'Hide password' : 'Show password'}
    >
      {showPassword ? (
        <HugeiconsIcon icon={ViewOffSlashIcon} className="h-4 w-4" aria-hidden="true" />
      ) : (
        <HugeiconsIcon icon={ViewIcon} className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );

  if (props.multiline) {
    const { multiline: _multiline, className, rows = 3, style, ...rest } = props;
    return (
      <div className="relative w-full">
        <textarea
          rows={rows}
          {...sharedInputProps}
          className={cn(
            baseFieldClass,
            'py-2 font-mono text-[13px] resize-none break-all',
            className
          )}
          style={
            masked
              ? ({
                  WebkitTextSecurity: 'disc',
                  textSecurity: 'disc',
                  ...style,
                } as React.CSSProperties)
              : style
          }
          {...rest}
        />
        {toggle}
      </div>
    );
  }

  const { multiline: _multiline, className, ...rest } = props;
  return (
    <div className="relative w-full">
      <input
        type={showPassword ? 'text' : 'password'}
        {...sharedInputProps}
        className={cn(baseFieldClass, 'h-9', className)}
        {...rest}
      />
      {toggle}
    </div>
  );
}

export { PasswordInput };
