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
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Link, useRouterState } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

const mainNav = [
  { to: '/', msgKey: msg`nav.home`, icon: HouseIcon },
  { to: '/schedule', msgKey: msg`nav.schedule`, icon: Calendar03Icon },
  { to: '/search', msgKey: msg`nav.search`, icon: Search01Icon },
  { to: '/trending', msgKey: msg`nav.trending`, icon: FireIcon },
  { to: '/rss', msgKey: msg`nav.rss`, icon: RssIcon },
] as const;

const bottomNav = [
  { to: '/torrent-search', msgKey: msg`nav.torrent`, icon: MagnetIcon },
  { to: '/downloads', msgKey: msg`nav.downloads`, icon: Download04Icon },
  { to: '/libraries', msgKey: msg`nav.libraries`, icon: FolderLibraryIcon },
  { to: '/settings', msgKey: msg`nav.settings`, icon: Setting07Icon },
] as const;

function NavItem({
  to,
  msgKey,
  icon,
  isActive,
}: {
  to: string;
  msgKey: { id: string };
  icon: typeof HouseIcon;
  isActive: boolean;
}) {
  const { i18n } = useLingui();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={to}
          className={cn(
            'relative flex items-center justify-center w-10 h-10 rounded-md transition-colors duration-200',
            isActive
              ? 'text-white bg-white/[0.08]'
              : 'text-white/40 hover:text-white/80 hover:bg-white/[0.04]'
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
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{i18n._(msgKey)}</TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

  return (
    <>
      {/* Desktop sidebar — Seanime: icon-only w-20, bg-[--background], tooltip on hover */}
      <TooltipProvider>
        <aside
          className="fixed left-0 top-0 bottom-0 w-20 z-40 flex flex-col items-center max-md:hidden"
          style={{ backgroundColor: 'transparent' }}
        >
          {/* Logo */}
          <div className="flex items-center justify-center h-16 shrink-0">
            <img src="/icons/logo.svg" alt="milmil" className="w-9 h-9" />
          </div>

          {/* Main nav */}
          <nav className="flex-1 flex flex-col items-center gap-1 pt-2 overflow-y-auto [&::-webkit-scrollbar]:hidden">
            {mainNav.map(({ to, msgKey, icon }) => (
              <NavItem key={to} to={to} msgKey={msgKey} icon={icon} isActive={isActive(to)} />
            ))}

            <div className="w-6 h-px my-3 bg-white/[0.06]" />

            {bottomNav.map(({ to, msgKey, icon }) => (
              <NavItem key={to} to={to} msgKey={msgKey} icon={icon} isActive={isActive(to)} />
            ))}
          </nav>
        </aside>
      </TooltipProvider>

      <MobileNav />
    </>
  );
}

const mobileNav = [
  { to: '/', msgKey: msg`nav.home`, icon: HouseIcon },
  { to: '/schedule', msgKey: msg`nav.schedule`, icon: Calendar03Icon },
  { to: '/search', msgKey: msg`nav.search`, icon: Search01Icon },
  { to: '/libraries', msgKey: msg`nav.libraries`, icon: FolderLibraryIcon },
  { to: '/settings', msgKey: msg`nav.more`, icon: Menu01Icon },
] as const;

export function MobileNav() {
  const { i18n } = useLingui();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around h-14 md:hidden safe-area-bottom"
      style={{
        backgroundColor: 'rgba(7,7,7,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {mobileNav.map(({ to, msgKey, icon }) => (
        <Link
          key={to}
          to={to}
          className={cn(
            'flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-medium transition-colors',
            isActive(to) ? 'text-mm-accent' : 'text-white/30'
          )}
        >
          <HugeiconsIcon icon={icon} size={20} strokeWidth={isActive(to) ? 2 : 1.5} />
          <span>{i18n._(msgKey)}</span>
        </Link>
      ))}
    </nav>
  );
}
