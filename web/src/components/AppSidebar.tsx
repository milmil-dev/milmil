import {
  Calendar03Icon,
  Download04Icon,
  FireIcon,
  FolderLibraryIcon,
  HouseIcon,
  RssIcon,
  Search01Icon,
  Setting07Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Link, useRouterState } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

const mainNav = [
  { to: '/', label: 'Home', icon: HouseIcon },
  { to: '/schedule', label: 'Schedule', icon: Calendar03Icon },
  { to: '/search', label: 'Search', icon: Search01Icon },
  { to: '/trending', label: 'Trending', icon: FireIcon },
  { to: '/rss', label: 'RSS', icon: RssIcon },
] as const;

const bottomNav = [
  { to: '/downloads', label: 'Downloads', icon: Download04Icon },
  { to: '/libraries', label: 'Libraries', icon: FolderLibraryIcon },
  { to: '/settings', label: 'Settings', icon: Setting07Icon },
] as const;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, x: -6 },
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
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to={to}
            className={cn(
              'relative flex items-center justify-center w-10 h-10 rounded transition-colors',
              isActive ? 'text-white' : 'text-mm-text-tertiary hover:text-[oklch(70%_0.01_280)]'
            )}
          >
            {isActive && (
              <motion.div
                layoutId="activeBar"
                className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-mm-accent"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            {isActive && (
              <motion.div
                layoutId="activeBg"
                className="absolute inset-0 rounded"
                style={{ backgroundColor: 'oklch(14% 0.02 280)' }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative z-10">
              <HugeiconsIcon icon={icon} size={20} />
            </span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </motion.div>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

  return (
    <TooltipProvider>
      <motion.aside
        initial={{ x: -60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        className="fixed left-0 top-0 bottom-0 w-[60px] z-40 flex flex-col items-center border-r bg-mm-sidebar border-mm-border"
      >
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="py-5"
        >
          <p className="text-base font-bold tracking-tight text-mm-accent">m</p>
        </motion.div>

        {/* Main nav */}
        <motion.nav
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex-1 flex flex-col items-center gap-1 pt-2"
        >
          {mainNav.map(({ to, label, icon }) => (
            <NavItem key={to} to={to} label={label} icon={icon} isActive={isActive(to)} />
          ))}
        </motion.nav>

        {/* Separator */}
        <div className="w-6 h-px my-2" style={{ backgroundColor: 'oklch(16% 0.01 280)' }} />

        {/* Bottom nav */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center gap-1 pb-4"
        >
          {bottomNav.map(({ to, label, icon }) => (
            <NavItem key={to} to={to} label={label} icon={icon} isActive={isActive(to)} />
          ))}
        </motion.div>
      </motion.aside>
    </TooltipProvider>
  );
}
