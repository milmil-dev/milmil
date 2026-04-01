import { motion } from 'motion/react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
}

const easeOutExpo = [0.16, 1, 0.3, 1] as const;

export function PageTransition({ children, className }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.998 }}
      transition={{
        duration: 0.3,
        ease: easeOutExpo,
        exit: { duration: 0.15, ease: [0.4, 0, 1, 1] },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
