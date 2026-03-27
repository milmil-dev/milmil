import {
  Calendar03Icon,
  Download04Icon,
  FireIcon,
  FolderLibraryIcon,
  HouseIcon,
  MagnetIcon,
  Menu01Icon,
  RssIcon,
  Search01Icon,
  Setting07Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Link, useRouterState } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useState } from 'react';
import { cn } from '../lib/utils';

const mainNav = [
  { to: '/', label: 'Home', icon: HouseIcon },
  { to: '/schedule', label: 'Schedule', icon: Calendar03Icon },
  { to: '/search', label: 'Search', icon: Search01Icon },
  { to: '/trending', label: 'Trending', icon: FireIcon },
  { to: '/rss', label: 'RSS', icon: RssIcon },
] as const;

const bottomNav = [
  { to: '/torrent-search', label: 'Torrent', icon: MagnetIcon },
  { to: '/downloads', label: 'Downloads', icon: Download04Icon },
  { to: '/libraries', label: 'Libraries', icon: FolderLibraryIcon },
  { to: '/settings', label: 'Settings', icon: Setting07Icon },
] as const;

function NavItem({
  to,
  label,
  icon,
  isActive,
  expanded,
}: {
  to: string;
  label: string;
  icon: typeof HouseIcon;
  isActive: boolean;
  expanded: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'relative flex items-center gap-3 rounded-md transition-all duration-200',
        expanded ? 'px-3 py-2' : 'justify-center w-10 h-10',
        isActive
          ? 'text-white bg-white/[0.06]'
          : 'text-[--muted] hover:text-white/80 hover:bg-white/[0.03]'
      )}
    >
      {isActive && (
        <motion.div
          layoutId="sidebarActive"
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-mm-accent"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      )}
      <HugeiconsIcon icon={icon} size={20} strokeWidth={isActive ? 2 : 1.5} />
      {expanded && <span className="text-[13px] font-medium whitespace-nowrap">{label}</span>}
    </Link>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {/* Desktop sidebar — icon-only 80px, expands to 260px on hover (Seanime pattern) */}
      <motion.aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className={cn(
          'fixed left-0 top-0 bottom-0 z-40 flex flex-col items-center max-md:hidden transition-[width] duration-300 overflow-hidden',
          expanded ? 'w-[260px] rounded-tr-xl rounded-br-xl' : 'w-20'
        )}
        style={expanded ? { backgroundColor: 'var(--mm-bg)', borderRight: '1px solid rgba(255,255,255,0.05)' } : undefined}
      >
        {/* Logo */}
        <div className={cn('flex items-center shrink-0 h-16', expanded ? 'px-4 self-start' : 'justify-center')}>
          <span className="text-lg font-bold tracking-tight text-mm-accent">
            {expanded ? 'milmil' : 'm'}
          </span>
        </div>

        {/* Main nav */}
        <nav className={cn(
          'flex-1 flex flex-col gap-1 pt-2 overflow-y-auto [&::-webkit-scrollbar]:hidden',
          expanded ? 'px-3 w-full' : 'items-center'
        )}>
          {expanded && (
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/20">
              Browse
            </p>
          )}
          {mainNav.map(({ to, label, icon }) => (
            <NavItem key={to} to={to} label={label} icon={icon} isActive={isActive(to)} expanded={expanded} />
          ))}

          <div className={cn('h-px my-3 bg-white/[0.04]', expanded ? 'mx-2' : 'w-6')} />

          {expanded && (
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/20">
              Manage
            </p>
          )}
          {bottomNav.map(({ to, label, icon }) => (
            <NavItem key={to} to={to} label={label} icon={icon} isActive={isActive(to)} expanded={expanded} />
          ))}
        </nav>
      </motion.aside>

      <MobileNav />
    </>
  );
}

const mobileNav = [
  { to: '/', label: 'Home', icon: HouseIcon },
  { to: '/schedule', label: 'Schedule', icon: Calendar03Icon },
  { to: '/search', label: 'Search', icon: Search01Icon },
  { to: '/libraries', label: 'Libraries', icon: FolderLibraryIcon },
  { to: '/settings', label: 'More', icon: Menu01Icon },
] as const;

export function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around h-14 md:hidden safe-area-bottom"
      style={{
        backgroundColor: 'oklch(4% 0.005 260 / 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {mobileNav.map(({ to, label, icon }) => (
        <Link
          key={to}
          to={to}
          className={cn(
            'flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-medium transition-colors',
            isActive(to) ? 'text-mm-accent' : 'text-white/30'
          )}
        >
          <HugeiconsIcon icon={icon} size={20} strokeWidth={isActive(to) ? 2 : 1.5} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
