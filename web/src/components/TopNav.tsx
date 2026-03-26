import { Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Link, useRouterState } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

const tabs = [
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
      className="sticky top-0 z-30 flex items-center h-14 px-6 gap-1 border-b border-mm-border/40"
      style={{
        backgroundColor: 'oklch(8% 0.015 260 / 0.9)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {/* Page tabs */}
      <nav className="flex items-center gap-1">
        {tabs.map(({ to, label, exact }) => {
          const isActive = exact ? pathname === to : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'relative px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors',
                isActive
                  ? 'text-white bg-white/[0.08]'
                  : 'text-mm-text-secondary hover:text-mm-text-primary hover:bg-white/[0.04]'
              )}
            >
              {label}
              {isActive && (
                <motion.div
                  layoutId="topNavActive"
                  className="absolute -bottom-[15px] left-2 right-2 h-[2px] rounded-full bg-mm-accent"
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Search shortcut */}
      <Link
        to="/search"
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] text-mm-text-tertiary hover:text-mm-text-secondary hover:bg-white/[0.04] transition-colors"
      >
        <HugeiconsIcon icon={Search01Icon} size={15} />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden sm:inline ml-1 text-[11px] text-mm-text-muted border border-mm-border/60 rounded px-1.5 py-0.5">
          ⌘K
        </kbd>
      </Link>
    </motion.header>
  );
}
