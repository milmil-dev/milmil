import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { motion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { cn } from '@/lib/utils';
import { PageTransition } from '@/components/PageTransition';

import {
  Settings02Icon,
  Link04Icon,
  PlayIcon,
  UserIcon,
  HardDriveIcon,
  InformationCircleIcon,
} from '@hugeicons/core-free-icons';

const NAV_ITEMS = [
  { path: '/settings/general', labelKey: msg`settings.nav.general`, icon: Settings02Icon },
  { path: '/settings/integrations', labelKey: msg`settings.nav.integrations`, icon: Link04Icon },
  { path: '/settings/player', labelKey: msg`settings.nav.player`, icon: PlayIcon },
  { path: '/settings/account', labelKey: msg`settings.nav.account`, icon: UserIcon },
  { path: '/settings/storage', labelKey: msg`settings.nav.storage`, icon: HardDriveIcon },
  { path: '/settings/about', labelKey: msg`settings.nav.about`, icon: InformationCircleIcon },
] as const;

export function SettingsLayout() {
  const { i18n } = useLingui();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <PageTransition>
      <div className="min-h-screen">
        <div className="flex">
          {/* Sidebar */}
          <aside
            className="sticky top-0 h-screen w-[220px] shrink-0 border-r border-white/[0.04] p-5 pt-8"
            style={{
              background:
                'linear-gradient(180deg, rgba(232,143,170,0.03) 0%, transparent 40%)',
            }}
          >
            <div className="mb-6">
              <p className="text-[9px] font-bold uppercase tracking-[2px] text-mm-accent">
                milmil
              </p>
              <h1 className="mt-0.5 text-[16px] font-bold text-white">
                {i18n._(msg`settings.pageTitle`)}
              </h1>
            </div>

            <nav className="flex flex-col gap-0.5">
              {NAV_ITEMS.map((item, i) => {
                const isActive = pathname === item.path;
                return (
                  <motion.div
                    key={item.path}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      delay: i * 0.03,
                      duration: 0.25,
                      ease: [0.25, 0.46, 0.45, 0.94],
                    }}
                  >
                    <Link
                      to={item.path as string}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors',
                        isActive
                          ? 'bg-[rgba(232,143,170,0.1)] border border-[rgba(232,143,170,0.15)] text-white shadow-[0_0_20px_rgba(232,143,170,0.06)]'
                          : 'border border-transparent text-white/45 hover:text-white/70'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-md',
                          isActive
                            ? 'bg-[rgba(232,143,170,0.15)]'
                            : 'bg-white/[0.04]'
                        )}
                      >
                        <HugeiconsIcon
                          icon={item.icon}
                          size={14}
                          className={isActive ? 'text-mm-accent' : 'text-white/40'}
                        />
                      </span>
                      {i18n._(item.labelKey)}
                    </Link>
                  </motion.div>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <main
            className="flex-1 overflow-y-auto p-8 pt-8"
            style={{
              background:
                'linear-gradient(135deg, rgba(232,143,170,0.015) 0%, transparent 50%)',
            }}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </PageTransition>
  );
}
