import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { motion } from 'motion/react';
import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Settings02Icon,
  Link04Icon,
  PlayIcon,
  UserIcon,
  HardDriveIcon,
  InformationCircleIcon,
} from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import { PageTransition } from '@/components/PageTransition';
import { GeneralPanel } from './GeneralPanel';
import { IntegrationsPanel } from './IntegrationsPanel';
import { PlayerPanel } from './PlayerPanel';
import { AccountPanel } from './AccountPanel';
import { StoragePanel } from './StoragePanel';
import { AboutPanel } from './AboutPanel';

const TABS = [
  { id: 'general', labelKey: msg`settings.nav.general`, icon: Settings02Icon },
  { id: 'integrations', labelKey: msg`settings.nav.integrations`, icon: Link04Icon },
  { id: 'player', labelKey: msg`settings.nav.player`, icon: PlayIcon },
  { id: 'account', labelKey: msg`settings.nav.account`, icon: UserIcon },
  { id: 'storage', labelKey: msg`settings.nav.storage`, icon: HardDriveIcon },
  { id: 'about', labelKey: msg`settings.nav.about`, icon: InformationCircleIcon },
] as const;

type TabId = (typeof TABS)[number]['id'];

const PANELS: Record<TabId, React.FC> = {
  general: GeneralPanel,
  integrations: IntegrationsPanel,
  player: PlayerPanel,
  account: AccountPanel,
  storage: StoragePanel,
  about: AboutPanel,
};

export function SettingsPage() {
  const { i18n } = useLingui();
  const [activeTab, setActiveTab] = useState<TabId>('general');

  const ActivePanel = PANELS[activeTab];

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl p-4 sm:p-8 lg:py-12">
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
