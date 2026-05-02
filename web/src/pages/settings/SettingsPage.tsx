import {
  ArrowLeft01Icon,
  CloudIcon,
  Download04Icon,
  HardDriveIcon,
  InformationCircleIcon,
  Link04Icon,
  Logout01Icon,
  Notification03Icon,
  PlayIcon,
  Settings02Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { PageAtmosphere } from '@/components/PageAtmosphere';
import { PageTransition } from '@/components/PageTransition';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';
import { AboutPanel } from './AboutPanel';
import { AccountPanel } from './AccountPanel';
import { BackupPanel } from './BackupPanel';
import { DownloadPanel } from './DownloadPanel';
import { GeneralPanel } from './GeneralPanel';
import { IntegrationsPanel } from './IntegrationsPanel';
import { NotificationSettingsPanel } from './NotificationSettingsPanel';
import { PlayerPanel } from './PlayerPanel';
import { StoragePanel } from './StoragePanel';

const TABS = [
  { id: 'general', labelKey: msg`settings.nav.general`, icon: Settings02Icon },
  { id: 'integrations', labelKey: msg`settings.nav.integrations`, icon: Link04Icon },
  { id: 'notifications', labelKey: msg`settings.nav.notifications`, icon: Notification03Icon },
  { id: 'download', labelKey: msg`settings.nav.download`, icon: Download04Icon },
  { id: 'player', labelKey: msg`settings.nav.player`, icon: PlayIcon },
  { id: 'account', labelKey: msg`settings.nav.account`, icon: UserIcon },
  { id: 'backup', labelKey: msg`settings.nav.backup`, icon: CloudIcon },
  { id: 'storage', labelKey: msg`settings.nav.storage`, icon: HardDriveIcon },
  { id: 'about', labelKey: msg`settings.nav.about`, icon: InformationCircleIcon },
] as const;

type TabId = (typeof TABS)[number]['id'];

const PANELS: Record<TabId, React.FC> = {
  general: GeneralPanel,
  integrations: IntegrationsPanel,
  notifications: NotificationSettingsPanel,
  download: DownloadPanel,
  player: PlayerPanel,
  backup: BackupPanel,
  account: AccountPanel,
  storage: StoragePanel,
  about: AboutPanel,
};

const TAB_IDS: Set<string> = new Set(TABS.map((t) => t.id));
const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;
const EASE_STANDARD = [0.25, 0.46, 0.45, 0.94] as const;

const mobileListVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: 0.24, ease: EASE_OUT_QUINT, staggerChildren: 0.035 },
  },
  exit: { opacity: 0, transition: { duration: 0.16, ease: EASE_OUT_QUINT } },
};

const mobileRowVariants = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0, transition: { duration: 0.22, ease: EASE_OUT_QUINT } },
};

const mobileDetailVariants = {
  hidden: { opacity: 0, x: 28 },
  show: { opacity: 1, x: 0, transition: { duration: 0.24, ease: EASE_OUT_QUINT } },
  exit: { opacity: 0, x: 18, transition: { duration: 0.16, ease: EASE_OUT_QUINT } },
};

const mobilePanelContentClassName = cn(
  'w-full max-w-full',
  '[&>div>h2:first-child]:hidden',
  '[&>div>h2:first-child+p]:hidden',
  '[&>div>div:first-child>h2:first-child]:hidden',
  '[&>div>div:first-child>h2:first-child+p]:hidden',
  '[&>div>div:first-child>div:first-child>h2:first-child]:hidden',
  '[&>div>div:first-child>div:first-child>h2:first-child+p]:hidden'
);

function getIsDesktopSettingsLayout() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(min-width: 1024px)').matches;
}

export function SettingsPage() {
  const { i18n } = useLingui();
  useDocumentTitle(i18n._(msg`nav.settings`));
  const search = useSearch({ strict: false }) as { tab?: string };
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [isDesktopSettingsLayout, setIsDesktopSettingsLayout] = useState(
    getIsDesktopSettingsLayout
  );
  const selectedTab: TabId | null =
    search.tab && TAB_IDS.has(search.tab) ? (search.tab as TabId) : null;
  const activeTab: TabId = selectedTab ?? 'general';

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const updateLayoutMode = () => setIsDesktopSettingsLayout(mediaQuery.matches);

    updateLayoutMode();
    mediaQuery.addEventListener('change', updateLayoutMode);
    return () => mediaQuery.removeEventListener('change', updateLayoutMode);
  }, []);

  const setActiveTab = (tab: TabId) => {
    if (!isDesktopSettingsLayout) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
    navigate({ to: '/settings', search: { tab }, replace: true });
  };

  const goToSettingsRoot = () => {
    navigate({ to: '/settings', search: {}, replace: true });
  };

  const handleLogout = () => {
    logout();
    navigate({ to: '/login', replace: true });
  };

  const ActivePanel = PANELS[activeTab];
  const isMobileDetailView = !!selectedTab && !isDesktopSettingsLayout;
  const activeTabLabel = i18n._(
    TABS.find((tab) => tab.id === activeTab)?.labelKey ?? TABS[0].labelKey
  );
  const accountInitial = user?.username?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <PageTransition disabled={!isDesktopSettingsLayout}>
      <div className="relative mx-auto w-full max-w-5xl px-3 py-4 sm:p-8 lg:py-12">
        <PageAtmosphere preset="settings" />

        {isDesktopSettingsLayout ? (
          <>
            {/* Header — centered */}
            <div className="mb-8 text-center">
              <h1 className="text-xl font-bold text-white tracking-tight sm:text-2xl">
                {i18n._(msg`settings.pageTitle`)}
              </h1>
            </div>

            {/* Desktop two-column grid: nav + content, centered */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr] lg:gap-8">
              {/* Nav column */}
              <div className="lg:sticky lg:top-8 lg:self-start">
                <div className="lg:rounded-xl lg:border lg:border-white/[0.06] lg:bg-white/[0.02] lg:p-2">
                  <nav className="flex gap-1.5 lg:flex-col lg:gap-1">
                    {TABS.map((tab) => {
                      const isActive = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          className={cn(
                            'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 lg:w-full lg:gap-2.5 lg:text-left',
                            isActive
                              ? 'bg-white/[0.06] text-white'
                              : 'text-white/40 hover:text-white/70 hover:bg-white/[0.03]'
                          )}
                        >
                          <HugeiconsIcon
                            icon={tab.icon}
                            size={16}
                            className={cn(
                              'shrink-0 transition-colors',
                              isActive ? 'text-mm-accent' : 'text-white/30'
                            )}
                          />
                          {i18n._(tab.labelKey)}
                        </button>
                      );
                    })}
                  </nav>
                </div>
              </div>

              {/* Content column */}
              <div className="min-w-0 pb-8">
                <motion.div
                  key={activeTab}
                  data-testid="desktop-settings-detail-motion"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2, ease: EASE_STANDARD }}
                  className="w-full max-w-full"
                >
                  <ActivePanel />
                </motion.div>
              </div>
            </div>
          </>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {!selectedTab ? (
              <motion.div
                key="mobile-settings-list"
                data-testid="mobile-settings-list"
                variants={mobileListVariants}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                <div className="mb-4 px-1">
                  <h1 className="text-[28px] font-bold tracking-tight text-white">
                    {i18n._(msg`settings.pageTitle`)}
                  </h1>
                </div>
                <motion.button
                  type="button"
                  variants={mobileRowVariants}
                  onClick={() => setActiveTab('account')}
                  className="mb-4 flex min-h-[76px] w-full items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.045] px-4 text-left shadow-[0_14px_32px_rgba(0,0,0,0.16)] transition-colors active:bg-white/[0.075]"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-mm-accent/20 text-lg font-bold text-mm-accent ring-1 ring-mm-accent/30">
                    {accountInitial}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px] font-semibold leading-6 text-white">
                      {user?.username ?? i18n._(msg`settings.nav.account`)}
                    </span>
                    <span className="block truncate text-xs leading-5 text-white/35">
                      {user?.id ? `ID: ${user.id}` : i18n._(msg`account.local`)}
                    </span>
                  </span>
                  <span className="text-xl leading-none text-white/25">›</span>
                </motion.button>
                <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.04]">
                  {TABS.map((tab, index) => (
                    <motion.button
                      key={tab.id}
                      type="button"
                      variants={mobileRowVariants}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'flex min-h-12 w-full items-center gap-3 px-4 text-left transition-colors active:bg-white/[0.08]',
                        index !== TABS.length - 1 && 'border-b border-white/[0.06]'
                      )}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-mm-accent">
                        <HugeiconsIcon icon={tab.icon} size={17} />
                      </span>
                      <span className="min-w-0 flex-1 text-[15px] font-medium text-white/90">
                        {i18n._(tab.labelKey)}
                      </span>
                      <span className="text-xl leading-none text-white/25">›</span>
                    </motion.button>
                  ))}
                </div>

                <motion.div variants={mobileRowVariants} className="mt-4">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-red-400/[0.10] bg-red-500/[0.055] px-4 text-left text-red-300 transition-colors active:bg-red-500/[0.10]"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-500/[0.10] text-red-300">
                      <HugeiconsIcon icon={Logout01Icon} size={17} />
                    </span>
                    <span className="min-w-0 flex-1 text-[15px] font-semibold">
                      {i18n._(msg`account.logout`)}
                    </span>
                  </button>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key={`mobile-settings-detail-${activeTab}`}
                data-testid="mobile-settings-detail"
                variants={mobileDetailVariants}
                initial={isMobileDetailView ? 'hidden' : false}
                animate={isMobileDetailView ? 'show' : { opacity: 1 }}
                exit={isMobileDetailView ? 'exit' : { opacity: 0 }}
                className="w-full max-w-full min-w-0 pb-8"
              >
                <div className="relative mb-4 flex min-h-10 items-center justify-center">
                  <button
                    type="button"
                    aria-label="Back to Settings"
                    onClick={goToSettingsRoot}
                    className="absolute left-0 flex min-h-10 items-center gap-1.5 rounded-lg px-1.5 text-sm font-semibold text-mm-accent active:bg-white/[0.06]"
                  >
                    <HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
                    {i18n._(msg`settings.pageTitle`)}
                  </button>
                  <h1 className="max-w-[48vw] truncate text-base font-bold text-white">
                    {activeTabLabel}
                  </h1>
                </div>
                <div
                  data-testid="mobile-settings-detail-motion"
                  className={mobilePanelContentClassName}
                >
                  <ActivePanel />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </PageTransition>
  );
}
