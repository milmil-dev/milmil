import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

function Checkbox({
  className,
  checked,
  onCheckedChange,
  disabled,
  size = 18,
}: {
  className?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'relative shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      style={{ width: size, height: size }}
    >
      <motion.div
        className={cn(
          'absolute inset-0 rounded-[5px] border-[1.5px]',
          checked ? 'border-mm-accent bg-mm-accent' : 'border-white/20 bg-white/[0.04]'
        )}
        animate={{ scale: checked ? 1 : 1 }}
        whileTap={{ scale: 0.85 }}
        transition={{ duration: 0.1 }}
      />
      <motion.svg
        viewBox="0 0 16 16"
        fill="none"
        className="absolute inset-0 pointer-events-none"
        style={{ width: size, height: size }}
        initial={false}
        animate={{ opacity: checked ? 1 : 0, scale: checked ? 1 : 0.5 }}
        transition={{ duration: 0.15 }}
      >
        <path
          d="M4.5 8.5L7 11L11.5 5.5"
          stroke="black"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>
    </button>
  );
}

export { Checkbox };
