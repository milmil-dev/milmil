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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="sticky top-0 z-30 flex items-center h-12 px-6 gap-1"
      style={{
        backgroundColor: 'oklch(8% 0.01 260 / 0.6)',
        backdropFilter: 'blur(20px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
      }}
    >
      {/* Page tabs */}
      <nav className="flex items-center gap-0.5">
        {tabs.map(({ to, label, exact }) => {
          const isActive = exact ? pathname === to : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'relative px-3 py-1.5 text-[13px] font-medium rounded-md transition-all duration-200',
                isActive
                  ? 'text-white'
                  : 'text-mm-text-muted hover:text-mm-text-secondary'
              )}
            >
              {label}
              {isActive && (
                <motion.div
                  layoutId="topNavActive"
                  className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-mm-accent"
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Search shortcut — no border on kbd */}
      <Link
        to="/search"
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] text-mm-text-muted hover:text-mm-text-secondary hover:bg-white/[0.03] transition-all duration-200"
      >
        <HugeiconsIcon icon={Search01Icon} size={15} />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden sm:inline ml-1 text-[10px] text-mm-text-muted bg-white/[0.04] rounded px-1.5 py-0.5">
          ⌘K
        </kbd>
      </Link>
    </motion.header>
  );
}
