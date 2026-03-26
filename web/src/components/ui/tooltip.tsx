import { Tooltip as TooltipPrimitive } from '@base-ui-components/react/tooltip';
import * as React from 'react';

import { cn } from '@/lib/utils';

function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <TooltipPrimitive.Provider>{children}</TooltipPrimitive.Provider>;
}

function Tooltip({
  children,
  ...props
}: { children: React.ReactNode } & React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root {...props}>{children}</TooltipPrimitive.Root>;
}

function TooltipTrigger({
  children,
  className,
  asChild,
  ...props
}: React.ComponentProps<'button'> & { children: React.ReactNode; asChild?: boolean }) {
  if (asChild && React.isValidElement<Record<string, unknown>>(children)) {
    return <TooltipPrimitive.Trigger render={children} className={className} {...props} />;
  }
  return (
    <TooltipPrimitive.Trigger className={className} {...props}>
      {children}
    </TooltipPrimitive.Trigger>
  );
}

function TooltipContent({
  className,
  children,
  side = 'right',
  sideOffset = 8,
  ...props
}: React.ComponentProps<'div'> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset}>
        <TooltipPrimitive.Popup
          className={cn(
            'z-50 rounded-md px-2.5 py-1 text-xs font-medium shadow-md transition-all duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            className
          )}
          style={{
            backgroundColor: 'oklch(85% 0.01 280)',
            color: 'oklch(10% 0.01 280)',
          }}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow
            className="translate-y-[calc(-50%_-_1px)]"
            style={{ color: 'oklch(85% 0.01 280)' }}
          />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
