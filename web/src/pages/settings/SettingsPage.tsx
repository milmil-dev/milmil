import {
  CloudIcon,
  Download04Icon,
  HardDriveIcon,
  InformationCircleIcon,
  Link04Icon,
  Notification03Icon,
  PlayIcon,
  Settings02Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { PageAtmosphere } from '@/components/PageAtmosphere';
import { PageTransition } from '@/components/PageTransition';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { cn } from '@/lib/utils';
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

export function SettingsPage() {
  const { i18n } = useLingui();
  useDocumentTitle(i18n._(msg`nav.settings`));
  const search = useSearch({ strict: false }) as { tab?: string };
  const navigate = useNavigate();
  const activeTab: TabId =
    search.tab && TAB_IDS.has(search.tab) ? (search.tab as TabId) : 'general';

  const setActiveTab = (tab: TabId) => {
    navigate({ to: '/settings', search: { tab }, replace: true });
  };

  const ActivePanel = PANELS[activeTab];

  return (
    <PageTransition>
      <div className="relative mx-auto max-w-5xl p-4 sm:p-8 lg:py-12">
        <PageAtmosphere preset="settings" />
        {/* Header — centered */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {i18n._(msg`settings.pageTitle`)}
          </h1>
        </div>

        {/* Two-column grid: nav + content, centered */}
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
          {/* Nav column */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
              <nav className="flex flex-wrap lg:flex-col gap-1">
                {TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 w-fit lg:w-full text-left',
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
          <div className="min-w-0">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <ActivePanel />
            </motion.div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
