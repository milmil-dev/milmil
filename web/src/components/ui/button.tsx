import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all cursor-pointer outline-none focus-visible:ring-[2px] focus-visible:ring-mm-accent/30 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-ink/[0.10] text-ink font-semibold hover:bg-ink/[0.15]',
        destructive:
          'bg-red-500/20 text-red-400 border border-red-500/20 hover:bg-red-500/30 focus-visible:ring-red-500/20',
        outline:
          'border border-ink/[0.08] bg-ink/[0.04] text-ink/80 hover:bg-ink/[0.08] hover:text-ink',
        secondary: 'bg-ink/[0.06] text-ink/70 hover:bg-ink/[0.10] hover:text-ink/90',
        ghost: 'text-ink/60 hover:bg-ink/[0.06] hover:text-ink/90',
        accent: 'bg-mm-accent text-ink font-semibold hover:bg-mm-accent/85',
        link: 'text-mm-accent underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: "h-6 gap-1 rounded-lg px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 rounded-lg px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-lg px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
