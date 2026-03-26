import { Link, useRouterState } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

const navLinks = [
  { to: '/', label: 'Home', exact: true },
  { to: '/schedule', label: 'Schedule', exact: false },
  { to: '/trending', label: 'Discover', exact: false },
] as const;

export function TopNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <motion.header
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="sticky top-0 z-30 flex items-center h-12 px-6 gap-6 border-b"
      style={{
        backgroundColor: 'oklch(7% 0.01 280 / 0.85)',
        borderColor: 'oklch(12% 0.01 280)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {navLinks.map(({ to, label, exact }) => {
        const isActive = exact ? pathname === to : pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              'relative text-[13px] font-medium transition-colors py-1',
              isActive
                ? 'text-white'
                : 'text-[oklch(45%_0.01_280)] hover:text-[oklch(75%_0.01_280)]'
            )}
          >
            {label}
            {isActive && (
              <motion.div
                layoutId="topNavUnderline"
                className="absolute -bottom-[13px] left-0 right-0 h-px"
                style={{ backgroundColor: 'oklch(65% 0.2 35)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
            )}
          </Link>
        );
      })}
    </motion.header>
  );
}
