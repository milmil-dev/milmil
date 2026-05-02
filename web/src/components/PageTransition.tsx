import { motion } from 'motion/react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

const easeOutExpo = [0.16, 1, 0.3, 1] as const;

export function PageTransition({ children, className, disabled }: Props) {
  if (disabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.998 }}
      transition={{
        duration: 0.3,
        ease: easeOutExpo,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
