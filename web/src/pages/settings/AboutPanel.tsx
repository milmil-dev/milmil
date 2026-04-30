import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
  GithubIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { SettingsCard } from '@/components/settings/SettingsCard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useUpdateCheck } from '@/hooks/use-update-check';
import { api } from '@/lib/api-client';
import { useUpdateStore } from '@/store/update-store';

function UpdateRow() {
  const { i18n } = useLingui();
  const { hasUpdate, latest, releaseUrl, dismiss } = useUpdateCheck();
  const dismissedVersion = useUpdateStore((s) => s.dismissedVersion);

  if (!latest) return null; // silent on offline / never-cached

  if (!hasUpdate) {
    return <p className="text-[13px] text-white/40">{i18n._(msg`about.upToDate`)}</p>;
  }

  const isDismissed = dismissedVersion === latest;
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[13px] text-white/70">
        {i18n._(msg`about.updateAvailable`)} v{latest} —{' '}
        <a
          href={releaseUrl ?? '#'}
          target="_blank"
          rel="noreferrer"
          className="text-mm-accent hover:underline"
        >
          {i18n._(msg`about.releaseNotes`)} →
        </a>
      </p>
      {!isDismissed && (
        <button
          type="button"
          onClick={() => dismiss(latest)}
          className="text-[12px] text-white/40 transition-colors hover:text-white/70"
        >
          {i18n._(msg`about.dismiss`)}
        </button>
      )}
    </div>
  );
}

interface SystemInfo {
  version: string;
  uptime: string;
  go_version: string;
  platform: string;
}

export function AboutPanel() {
  const { i18n } = useLingui();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const { data: systemInfo, isLoading } = useQuery({
    queryKey: ['system-info'],
    queryFn: () => api.get<SystemInfo>('/api/v1/system/info'),
  });

  const handleExport = async () => {
    try {
      const data = await api.get<Record<string, unknown>>('/api/v1/settings/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'milmil-settings.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(i18n._(msg`about.exportSuccess`));
    } catch {
      toast.error(i18n._(msg`about.exportFailed`));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      setImportDialogOpen(true);
    }
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    if (!pendingFile) return;
    try {
      const text = await pendingFile.text();
      const data = JSON.parse(text);
      await api.post('/api/v1/settings/import', data);
      toast.success(i18n._(msg`about.importSuccess`));
    } catch {
      toast.error(i18n._(msg`about.importFailed`));
    } finally {
      setPendingFile(null);
    }
  };

  const handleResetConfirm = async () => {
    try {
      await api.post('/api/v1/settings/reset');
      toast.success(i18n._(msg`about.resetSuccess`));
    } catch {
      toast.error(i18n._(msg`about.resetFailed`));
    }
  };

  const infoRows: { label: string; value: string | undefined }[] = [
    { label: 'Version', value: systemInfo?.version },
    { label: 'Uptime', value: systemInfo?.uptime },
    { label: 'Go Version', value: systemInfo?.go_version },
    { label: 'Platform', value: systemInfo?.platform },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold text-white">{i18n._(msg`settings.nav.about`)}</h2>
      <p className="mt-1 mb-6 text-xs text-white/35">{i18n._(msg`about.subtitle`)}</p>

      <div className="space-y-3">
        {/* Card 1 — System Info */}
        <SettingsCard label={i18n._(msg`about.systemInfo`)}>
          <div className="space-y-2.5">
            {infoRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-[13px] text-white/50">{row.label}</span>
                {isLoading ? (
                  <div className="h-4 w-28 animate-pulse rounded bg-white/[0.06]" />
                ) : (
                  <span className="font-mono text-[13px] tabular-nums text-white/85">
                    {row.value ?? '—'}
                  </span>
                )}
              </div>
            ))}
            <UpdateRow />
          </div>
        </SettingsCard>

        {/* Card 2 — Settings Management */}
        <SettingsCard label={i18n._(msg`about.settingsManagement`)}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] text-white/85">{i18n._(msg`about.exportSettings`)}</p>
                <p className="mt-0.5 text-[11px] text-white/30">
                  {i18n._(msg`about.exportSettingsDesc`)}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
                {i18n._(msg`about.export`)}
              </Button>
            </div>

            <div className="h-px bg-white/[0.04]" />

            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] text-white/85">{i18n._(msg`about.importSettings`)}</p>
                <p className="mt-0.5 text-[11px] text-white/30">
                  {i18n._(msg`about.importSettingsDesc`)}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <HugeiconsIcon icon={ArrowUp01Icon} size={14} />
                {i18n._(msg`about.import`)}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            <div className="h-px bg-white/[0.04]" />

            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] text-white/85">{i18n._(msg`about.resetToDefaults`)}</p>
                <p className="mt-0.5 text-[11px] text-white/30">
                  {i18n._(msg`about.resetToDefaultsDesc`)}
                </p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setResetDialogOpen(true)}>
                <HugeiconsIcon icon={Delete02Icon} size={14} />
                {i18n._(msg`about.reset`)}
              </Button>
            </div>
          </div>
        </SettingsCard>

        {/* Card 3 — Links */}
        <SettingsCard label={i18n._(msg`about.links`)}>
          <a
            href="https://github.com/your-repo/milmil"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[13px] text-white/60 transition-colors hover:text-white/90"
          >
            <HugeiconsIcon icon={GithubIcon} size={16} />
            GitHub
          </a>
        </SettingsCard>
      </div>

      {/* Import confirmation dialog */}
      <AlertDialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18n._(msg`about.importConfirmTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>{i18n._(msg`about.importConfirmDesc`)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingFile(null)}>
              {i18n._(msg`common.cancel`)}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleImportConfirm}>
              {i18n._(msg`about.import`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset confirmation dialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18n._(msg`about.resetConfirmTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>{i18n._(msg`about.resetConfirmDesc`)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{i18n._(msg`common.cancel`)}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 text-white hover:bg-red-600"
              onClick={handleResetConfirm}
            >
              {i18n._(msg`about.reset`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
