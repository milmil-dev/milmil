import {
} from '@hugeicons/core-free-icons';
import { Link, useRouterState } from '@tanstack/react-router';
import { cn } from '../lib/utils';

const mainNav = [
  { to: '/', label: 'Home' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/search', label: 'Search' },
  { to: '/trending', label: 'Trending' },
  { to: '/rss', label: 'RSS' },
] as const;

const utilityNav = [
  { to: '/torrent-search', label: 'Torrent' },
  { to: '/downloads', label: 'Downloads' },
  { to: '/libraries', label: 'Libraries' },
  { to: '/settings', label: 'Settings' },
] as const;

function NavItem({
  to,
  label,
  isActive,
  useRouterLinks,
}: {
  to: string;
  label: string;
  isActive: boolean;
  useRouterLinks: boolean;
}) {
  const IconGlyph = label.slice(0, 1);

  if (!useRouterLinks) {
    return (
      <div>
        <a
          href={to}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            'group relative flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm transition-all duration-200',
            isActive
              ? 'border-mm-border-subtle bg-[linear-gradient(90deg,rgba(122,162,247,0.22),rgba(30,35,51,0.98))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
              : 'border-transparent text-mm-text-secondary hover:border-mm-border hover:bg-mm-surface/70 hover:text-white'
          )}
        >
          {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-mm-accent" />}
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-mm-border-subtle bg-mm-surface/60 text-mm-text-secondary">
            {IconGlyph}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{label}</span>
          </span>
        </a>
      </div>
    );
  }

  return (
    <div>
      <Link
        to={to}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'group relative flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm transition-all duration-200',
          isActive
            ? 'border-mm-border-subtle bg-[linear-gradient(90deg,rgba(122,162,247,0.22),rgba(30,35,51,0.98))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
            : 'border-transparent text-mm-text-secondary hover:border-mm-border hover:bg-mm-surface/70 hover:text-white'
        )}
      >
        {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-mm-accent" />}
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors',
            isActive
              ? 'border-[color-mix(in_oklch,var(--mm-accent)_46%,white_4%)] bg-[color-mix(in_oklch,var(--mm-accent)_16%,transparent)] text-white'
              : 'border-mm-border-subtle bg-mm-surface/60 text-mm-text-secondary group-hover:bg-mm-surface group-hover:text-white'
          )}
        >
          {IconGlyph}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{label}</span>
        </span>
      </Link>
    </div>
  );
}

function AppSidebarContent({ pathname, useRouterLinks }: { pathname: string; useRouterLinks: boolean }) {
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[280px] flex-col border-r border-mm-border bg-[linear-gradient(180deg,rgba(12,14,21,0.98),rgba(8,9,14,0.94))] lg:flex">
      <div className="flex items-center gap-3 border-b border-mm-border-subtle px-5 py-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color-mix(in_oklch,var(--mm-accent)_18%,transparent)] text-mm-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <p className="text-lg font-bold tracking-tight">m</p>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-[0.22em] text-mm-text-primary">milmil</p>
          <p className="text-xs text-mm-text-secondary">Desktop media shell</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <nav aria-label="Primary navigation" className="space-y-2">
          {mainNav.map(({ to, label }) => (
            <NavItem
              key={to}
              to={to}
              label={label}
              isActive={isActive(to)}
              useRouterLinks={useRouterLinks}
            />
          ))}
        </nav>

        <div className="mt-6 border-t border-mm-border-subtle pt-4">
          <p className="px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-mm-text-muted">
            Library tools
          </p>
          <nav aria-label="Utility navigation" className="space-y-2">
            {utilityNav.map(({ to, label }) => (
              <NavItem
                key={to}
                to={to}
                label={label}
                isActive={isActive(to)}
                useRouterLinks={useRouterLinks}
              />
            ))}
          </nav>
        </div>
      </div>
    </aside>
  );
}

function AppSidebarWithRouter() {
  const routerPathname = useRouterState({ select: (s) => s.location.pathname });
  return <AppSidebarContent pathname={routerPathname} useRouterLinks />;
}

export function AppSidebar({ pathname }: { pathname?: string }) {
  if (pathname !== undefined) {
    return <AppSidebarContent pathname={pathname} useRouterLinks={false} />;
  }

  return <AppSidebarWithRouter />;
}
