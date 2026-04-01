import {
  Bookmark01Icon,
  Calendar03Icon,
  Download04Icon,
  FireIcon,
  FolderLibraryIcon,
  HouseIcon,
  Logout01Icon,
  Menu01Icon,
  Search01Icon,
  Setting07Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/auth-store';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

const mainNav = [
  { to: '/', msgKey: msg`nav.home`, icon: HouseIcon },
  { to: '/schedule', msgKey: msg`nav.schedule`, icon: Calendar03Icon },
  { to: '/search', msgKey: msg`nav.search`, icon: Search01Icon },
  { to: '/discover', msgKey: msg`nav.discover`, icon: FireIcon },
] as const;

const bottomNav = [
  { to: '/downloads', msgKey: msg`nav.subscribe`, icon: Download04Icon },
  { to: '/libraries', msgKey: msg`nav.libraries`, icon: FolderLibraryIcon },
  { to: '/collection', msgKey: msg`collection.title`, icon: Bookmark01Icon },
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
          aria-label={i18n._(msgKey)}
          className={cn(
            'relative flex items-center justify-center w-10 h-10 rounded-md transition-colors duration-200',
            isActive
              ? 'text-white'
              : 'text-white/40 hover:text-white/80 hover:bg-white/[0.04]'
          )}
        >
          <AnimatePresence>
            {isActive && (
              <motion.div
                key="active"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 rounded-md bg-white/[0.08]"
              />
            )}
          </AnimatePresence>
          <HugeiconsIcon icon={icon} size={20} strokeWidth={isActive ? 2 : 1.5} className="relative z-[1]" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{i18n._(msgKey)}</TooltipContent>
    </Tooltip>
  );
}

/* ── Account avatar + dropdown ─────────────────────────────── */

function AccountAvatar() {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const initial = user?.username?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <div ref={ref} className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-white/[0.08] text-white/60 text-xs font-bold cursor-pointer transition-all hover:bg-white/[0.12] hover:text-white/80"
            aria-label={user?.username ?? 'Account'}
          >
            {initial}
          </button>
        </TooltipTrigger>
        {!open && <TooltipContent side="right">{user?.username ?? 'Account'}</TooltipContent>}
      </Tooltip>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -4, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute left-[calc(100%+8px)] bottom-0 w-48 rounded-lg border border-white/[0.08] bg-[#111] shadow-xl shadow-black/50 overflow-hidden z-50"
          >
            {/* User info */}
            <div className="px-3 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.08] text-white/60 text-xs font-bold shrink-0">
                  {initial}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user?.username}</p>
                  <p className="text-[10px] text-white/30">{i18n._(msg`account.local`)}</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate({ to: '/settings' });
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer"
              >
                <HugeiconsIcon icon={Setting07Icon} size={15} strokeWidth={1.5} />
                {i18n._(msg`nav.settings`)}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  logout();
                  navigate({ to: '/login' });
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400/70 hover:text-red-400 hover:bg-red-500/[0.04] transition-colors cursor-pointer"
              >
                <HugeiconsIcon icon={Logout01Icon} size={15} strokeWidth={1.5} />
                {i18n._(msg`account.logout`)}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Desktop sidebar ───────────────────────────────────────── */

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

  return (
    <>
      {/* Desktop sidebar — Seanime: icon-only w-20, bg-[--background], tooltip on hover */}
      <TooltipProvider delayDuration={100}>
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

          {/* Account avatar — bottom of sidebar */}
          <div className="pb-4 pt-2">
            <AccountAvatar />
          </div>
        </aside>
      </TooltipProvider>

      <MobileNav />
    </>
  );
}

/* ── Mobile nav ────────────────────────────────────────────── */

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
