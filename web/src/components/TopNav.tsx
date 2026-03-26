import { Link, useRouterState } from '@tanstack/react-router';
import { cn } from '../lib/utils';

const navLinks = [
  { to: '/', label: 'Home', exact: true },
  { to: '/schedule', label: 'Schedule', exact: false },
  { to: '/trending', label: 'Discover', exact: false },
] as const;

function getSectionLabel(pathname: string) {
  if (pathname === '/') return 'Home';
  if (pathname.startsWith('/schedule')) return 'Schedule';
  if (pathname.startsWith('/trending')) return 'Discover';
  if (pathname.startsWith('/search')) return 'Search';
  if (pathname.startsWith('/downloads')) return 'Downloads';
  if (pathname.startsWith('/libraries')) return 'Libraries';
  return 'Browse';
}

function TopNavContent({ pathname, useRouterLinks }: { pathname: string; useRouterLinks: boolean }) {
  const sectionLabel = getSectionLabel(pathname);

  return (
    <header
      className="sticky top-0 z-30 border-b border-mm-border-subtle bg-[linear-gradient(180deg,rgba(10,11,17,0.94),rgba(12,14,22,0.84))] backdrop-blur-xl"
      style={{
        boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.03), 0 12px 30px rgba(0, 0, 0, 0.22)',
      }}
    >
      <div className="flex items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-mm-text-muted">
            Desktop context
          </p>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="truncate text-sm font-semibold text-white">{sectionLabel}</h1>
            <span className="hidden rounded-full border border-mm-border-subtle bg-mm-surface/70 px-2.5 py-1 text-[11px] font-medium text-mm-text-secondary sm:inline-flex">
              Focused browsing
            </span>
          </div>
        </div>

        <nav
          aria-label="Context navigation"
          className="flex items-center gap-1 rounded-full border border-mm-border-subtle bg-[color-mix(in_oklch,var(--mm-sidebar)_88%,transparent)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
        >
          {navLinks.map(({ to, label, exact }) => {
            const isActive = exact ? pathname === to : pathname.startsWith(to);
            const LinkComponent = useRouterLinks ? Link : 'a';
            const linkProps = useRouterLinks ? { to } : { href: to };
            return (
              <LinkComponent
                key={to}
                {...linkProps}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-mm-border-subtle text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                    : 'text-mm-text-secondary hover:text-white'
                )}
              >
                {label}
              </LinkComponent>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function TopNavWithRouter() {
  const routerPathname = useRouterState({ select: (s) => s.location.pathname });
  return <TopNavContent pathname={routerPathname} useRouterLinks />;
}

export function TopNav({ pathname }: { pathname?: string }) {
  if (pathname !== undefined) {
    return <TopNavContent pathname={pathname} useRouterLinks={false} />;
  }

  return <TopNavWithRouter />;
}
