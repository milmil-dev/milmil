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

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.03, delayChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring' as const, stiffness: 400, damping: 30 },
  },
};

function NavItem({
  to,
  label,
  icon,
  isActive,
}: {
  to: string;
  label: string;
  icon: typeof HouseIcon;
  isActive: boolean;
}) {
  return (
    <motion.div variants={itemVariants}>
      <Link
        to={to}
        className={cn(
          'relative flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-all duration-200',
          isActive
            ? 'text-white bg-white/[0.06]'
            : 'text-mm-text-tertiary hover:text-mm-text-secondary hover:bg-white/[0.03]'
        )}
      >
        {isActive && (
          <motion.div
            layoutId="sidebarActive"
            className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-mm-accent"
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          />
        )}
        <HugeiconsIcon icon={icon} size={18} strokeWidth={isActive ? 2 : 1.5} />
        <span>{label}</span>
      </Link>
    </motion.div>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

  return (
    <>
      {/* Desktop sidebar — no borders, pure background separation */}
      <motion.aside
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        className="fixed left-0 top-0 bottom-0 w-[200px] z-40 flex flex-col max-md:hidden"
        style={{
          backgroundColor: 'oklch(7% 0.01 260 / 0.85)',
          backdropFilter: 'blur(24px) saturate(1.1)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.1)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 h-14 shrink-0">
          <span className="text-lg font-bold tracking-tight text-mm-accent">milmil</span>
        </div>

        {/* Main nav */}
        <motion.nav
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex-1 flex flex-col gap-0.5 px-2 pt-2 overflow-y-auto"
        >
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-mm-text-muted">
            Browse
          </p>
          {mainNav.map(({ to, label, icon }) => (
            <NavItem key={to} to={to} label={label} icon={icon} isActive={isActive(to)} />
          ))}

          {/* Subtle separator — no border, just spacing + faint line */}
          <div className="h-px my-3 mx-3 bg-white/[0.04]" />

          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-mm-text-muted">
            Manage
          </p>
          {bottomNav.map(({ to, label, icon }) => (
            <NavItem key={to} to={to} label={label} icon={icon} isActive={isActive(to)} />
          ))}
        </motion.nav>
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
        backgroundColor: 'oklch(7% 0.01 260 / 0.88)',
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
            isActive(to) ? 'text-mm-accent' : 'text-mm-text-muted'
          )}
        >
          <HugeiconsIcon icon={icon} size={20} strokeWidth={isActive(to) ? 2 : 1.5} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
