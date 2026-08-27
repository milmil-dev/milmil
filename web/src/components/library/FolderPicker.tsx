import { FolderOpenIcon, RefreshIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { type BrowseEntry, type BrowseInput, libraryApi } from '../../lib/api/library';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';

export type SourceType =
  | 'local'
  | 'smb'
  | 'sftp'
  | 'webdav'
  | 's3'
  | 'ftp'
  | 'http'
  | 'gdrive'
  | 'onedrive'
  | 'dropbox';

const LAST_BROWSE_PATH_PREFIX = 'milmil.lastBrowsePath.';

function getLastBrowsePath(sourceType: SourceType): string | null {
  try {
    return localStorage.getItem(`${LAST_BROWSE_PATH_PREFIX}${sourceType}`);
  } catch {
    return null;
  }
}

function setLastBrowsePath(sourceType: SourceType, path: string): void {
  try {
    localStorage.setItem(`${LAST_BROWSE_PATH_PREFIX}${sourceType}`, path);
  } catch {
    // ignore (quota exceeded, private mode, etc.)
  }
}

interface FolderBrowserCoreProps {
  sourceType: SourceType;
  getSourceConfig: () => Record<string, unknown>;
  /** Initial path to browse when the core mounts or `autoLoad` is true */
  initialPath?: string;
  onShareSelect?: (share: string) => void;
  /** Called every time the browse location changes, so the caller can track + display it */
  onBrowsePathChange?: (path: string) => void;
  /** Called whenever the share-level state flips (e.g. SMB before share selection) */
  onShareLevelChange?: (isShareLevel: boolean) => void;
  /** Called once directories have loaded at least once (flips from false → true) */
  onLoadedChange?: (hasLoaded: boolean) => void;
  /** When true, auto-loads `initialPath` (or `/`) on mount */
  autoLoad?: boolean;
  height?: number;
}

export function FolderBrowserCore({
  sourceType,
  getSourceConfig,
  initialPath,
  onShareSelect,
  onBrowsePathChange,
  onShareLevelChange,
  onLoadedChange,
  autoLoad,
  height = 200,
}: FolderBrowserCoreProps) {
  const { i18n } = useLingui();
  const [browsePath, setBrowsePath] = useState(
    initialPath && initialPath !== '' ? initialPath : '/'
  );
  const [directories, setDirectories] = useState<BrowseEntry[]>([]);
  const [isShareLevel, setIsShareLevel] = useState(false);
  const [selectedShare, setSelectedShare] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const browseMutation = useMutation({
    mutationFn: (input: BrowseInput) => libraryApi.browse(input),
    onSuccess: (data) => {
      setDirectories(data.directories ?? []);
      setIsNavigating(false);
      setHasLoaded(true);
      onLoadedChange?.(true);
    },
    onError: () => {
      setIsNavigating(false);
    },
  });

  const doBrowse = (path: string, overrideConfig?: Record<string, unknown>) => {
    if (browseMutation.isPending) return;
    const config = overrideConfig ?? getSourceConfig();
    const noShare = sourceType === 'smb' && !config.share;
    const nextIsShareLevel = noShare && (path === '/' || path === '');
    setIsShareLevel(nextIsShareLevel);
    onShareLevelChange?.(nextIsShareLevel);
    setIsNavigating(true);
    setBrowsePath(path);
    onBrowsePathChange?.(path);
    browseMutation.mutate({
      source_type: sourceType,
      source_config: config,
      path,
    });
  };

  useEffect(() => {
    if (autoLoad) {
      doBrowse(initialPath && initialPath !== '' ? initialPath : '/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, [autoLoad]);

  const breadcrumbs = browsePath === '/' ? [] : browsePath.split('/').filter(Boolean);
  const displayBreadcrumbs = selectedShare ? [selectedShare, ...breadcrumbs] : breadcrumbs;

  const handleCrumbClick = (index: number) => {
    if (selectedShare) {
      if (index === 0) {
        setSelectedShare('');
        const config = getSourceConfig();
        delete config.share;
        doBrowse('/', config);
        return;
      }
      const realIndex = index - 1;
      if (realIndex < 0) {
        doBrowse('/');
      } else {
        doBrowse(`/${breadcrumbs.slice(0, realIndex + 1).join('/')}`);
      }
    } else {
      if (index < 0) {
        doBrowse('/');
      } else {
        doBrowse(`/${breadcrumbs.slice(0, index + 1).join('/')}`);
      }
    }
  };

  const handleDirectoryClick = (entry: BrowseEntry) => {
    if (isShareLevel && sourceType === 'smb') {
      setSelectedShare(entry.name);
      if (onShareSelect) onShareSelect(entry.name);
      const config = getSourceConfig();
      config.share = entry.name;
      doBrowse('/', config);
      return;
    }
    doBrowse(entry.path);
  };

  return (
    <>
      <div className="flex items-center gap-1 px-3 py-2 border-b border-ink/[0.06] overflow-x-auto">
        <button
          type="button"
          onClick={() => handleCrumbClick(-1)}
          className={cn(
            'text-xs shrink-0 transition-colors cursor-pointer',
            breadcrumbs.length === 0 ? 'text-ink/70 font-medium' : 'text-ink/40 hover:text-ink/60'
          )}
        >
          /
        </button>
        {displayBreadcrumbs.map((segment, i) => (
          <span key={`${segment}-${i}`} className="flex items-center gap-1 shrink-0">
            <span className="text-ink/20 text-[10px]">›</span>
            <button
              type="button"
              onClick={() => handleCrumbClick(i)}
              className={cn(
                'text-xs transition-colors cursor-pointer',
                i === displayBreadcrumbs.length - 1
                  ? 'text-ink/70 font-medium'
                  : 'text-ink/40 hover:text-ink/60'
              )}
            >
              {segment}
            </button>
          </span>
        ))}
      </div>

      <div className="overflow-hidden" style={{ height: `${height}px` }}>
        <AnimatePresence mode="wait" initial={false}>
          {browseMutation.isPending && (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="space-y-1.5 p-2"
            >
              {[1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scaleX: 0.7 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{ delay: i * 0.05, duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  className="h-10 rounded-md bg-ink/[0.03] origin-left"
                  style={{
                    animationName: 'pulse',
                    animationDuration: '1.5s',
                    animationIterationCount: 'infinite',
                    animationTimingFunction: 'ease-in-out',
                  }}
                />
              ))}
            </motion.div>
          )}

          {hasLoaded && directories.length === 0 && !isNavigating && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="flex items-center justify-center h-full"
            >
              <p className="text-xs text-ink/30">{i18n._(msg`library.browse.noSubdirectories`)}</p>
            </motion.div>
          )}

          {directories.length > 0 && (
            <motion.div
              key={`dir-${browsePath}-${selectedShare}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="py-1 overflow-y-auto"
              style={{ height: `${height}px` }}
            >
              {(browsePath !== '/' || selectedShare) && (
                <button
                  type="button"
                  onClick={() => {
                    if (breadcrumbs.length > 0) {
                      handleCrumbClick(
                        selectedShare ? breadcrumbs.length - 1 : breadcrumbs.length - 2
                      );
                    } else if (selectedShare) {
                      handleCrumbClick(0);
                    } else {
                      handleCrumbClick(-1);
                    }
                  }}
                  className="w-full px-3 py-2 flex items-center gap-2.5 rounded-md cursor-pointer text-xs text-ink/40 hover:text-ink/60 hover:bg-ink/[0.03] transition-colors mb-0.5"
                >
                  <div className="shrink-0 w-7 h-7 rounded-md bg-ink/[0.04] flex items-center justify-center">
                    <svg viewBox="0 0 20 20" fill="none" className="w-3.5 h-3.5 text-ink/30">
                      <path
                        d="M3 6a2 2 0 0 1 2-2h3.5l2 2H15a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                    </svg>
                  </div>
                  <span>..</span>
                </button>
              )}
              {directories.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => handleDirectoryClick(entry)}
                  className="w-full px-3 py-2.5 flex items-center gap-2.5 rounded-md cursor-pointer text-sm text-ink/70 hover:bg-ink/[0.04] transition-colors"
                >
                  <div className="shrink-0 w-7 h-7 rounded-md bg-ink/[0.04] flex items-center justify-center">
                    <svg viewBox="0 0 20 20" fill="none" className="w-3.5 h-3.5 text-ink/40">
                      <path
                        d="M3 6a2 2 0 0 1 2-2h3.5l2 2H15a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                    </svg>
                  </div>
                  <span className="truncate font-medium">{entry.name}</span>
                  <span className="ml-auto text-ink/15 text-[10px] shrink-0">&#9654;</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

export function FolderBrowser({
  sourceType,
  getSourceConfig,
  currentPath,
  onSelect,
  onShareSelect,
  autoLoad,
  height = 200,
}: {
  sourceType: SourceType;
  getSourceConfig: () => Record<string, unknown>;
  currentPath: string;
  onSelect: (path: string) => void;
  onShareSelect?: (share: string) => void;
  autoLoad?: boolean;
  height?: number;
}) {
  const { i18n } = useLingui();
  const [browsePath, setBrowsePath] = useState('/');
  const [opened, setOpened] = useState(!!autoLoad);
  const [isShareLevel, setIsShareLevel] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpened(true)}
          className="text-[10px] font-medium uppercase tracking-[0.2em] text-ink/40 hover:text-ink/60 transition-colors cursor-pointer"
        >
          {i18n._(msg`library.browse.folders`)}
        </button>
      </div>
      {opened && (
        <div className="rounded-lg border border-ink/[0.06] bg-ink/[0.02] overflow-hidden">
          <FolderBrowserCore
            sourceType={sourceType}
            getSourceConfig={getSourceConfig}
            initialPath="/"
            autoLoad
            onShareSelect={onShareSelect}
            onBrowsePathChange={setBrowsePath}
            onShareLevelChange={setIsShareLevel}
            onLoadedChange={setHasLoaded}
            height={height}
          />
          <div className="h-[52px] px-3 py-2.5 border-t border-ink/[0.06] flex items-center">
            {isShareLevel ? (
              <p className="text-[11px] text-ink/25 text-center w-full">
                {i18n._(msg`library.wizard.smb.chooseServer`)}
              </p>
            ) : hasLoaded ? (
              <button
                type="button"
                onClick={() => onSelect(browsePath)}
                className={cn(
                  'w-full px-4 py-2 rounded-lg font-medium text-sm transition-all cursor-pointer flex items-center justify-center gap-2',
                  currentPath === browsePath
                    ? 'bg-mm-accent/15 border border-mm-accent/30 text-mm-accent'
                    : 'bg-ink/[0.06] text-ink/60 hover:bg-ink/[0.10] hover:text-ink/80'
                )}
              >
                {currentPath === browsePath ? (
                  <>
                    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
                      <path
                        d="M5 10l3 3 7-7"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {i18n._(msg`library.browse.selected`)}
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 text-ink/40">
                      <path
                        d="M3 6a2 2 0 0 1 2-2h3.5l2 2H15a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                    </svg>
                    {i18n._(msg`library.browse.select`)}
                    <span className="font-mono text-xs text-ink/40">{browsePath}</span>
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export function FolderPickerDialog({
  open,
  onOpenChange,
  sourceType,
  getSourceConfig,
  initialPath,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceType: SourceType;
  getSourceConfig: () => Record<string, unknown>;
  initialPath: string;
  onSelect: (path: string) => void;
}) {
  const { i18n } = useLingui();
  const [manualPath, setManualPath] = useState('');
  const [browsePath, setBrowsePath] = useState<string>('');

  const resolvedInitial = useMemo(() => {
    if (initialPath && initialPath !== '') return initialPath;
    const remembered = getLastBrowsePath(sourceType);
    if (remembered) return remembered;
    return '/';
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute when dialog opens
  }, [initialPath, sourceType, open]);

  useEffect(() => {
    if (open) {
      setManualPath(resolvedInitial);
      setBrowsePath(resolvedInitial);
    }
  }, [open, resolvedInitial]);

  const [coreKey, setCoreKey] = useState(0);
  const [pendingInitial, setPendingInitial] = useState<string>(resolvedInitial);

  const jumpTo = (path: string) => {
    const trimmed = path.trim() || '/';
    setPendingInitial(trimmed);
    setBrowsePath(trimmed);
    setCoreKey((k) => k + 1);
  };

  const reload = () => {
    setPendingInitial(browsePath || '/');
    setCoreKey((k) => k + 1);
  };

  const handleSelect = () => {
    if (!browsePath) return;
    setLastBrowsePath(sourceType, browsePath);
    onSelect(browsePath);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{i18n._(msg`library.folderPicker.title`)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  jumpTo(manualPath);
                }
              }}
              placeholder={i18n._(msg`library.folderPicker.pathPlaceholder`)}
              className="flex-1 font-mono text-sm"
            />
            <button
              type="button"
              onClick={reload}
              aria-label={i18n._(msg`library.folderPicker.refresh`)}
              className="shrink-0 p-2 rounded-md text-ink/60 hover:text-ink/90 hover:bg-ink/[0.06] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
            >
              <HugeiconsIcon icon={RefreshIcon} className="w-4 h-4" />
            </button>
          </div>
          <div className="rounded-lg border border-ink/[0.06] bg-ink/[0.02] overflow-hidden">
            <FolderBrowserCore
              key={coreKey}
              sourceType={sourceType}
              getSourceConfig={getSourceConfig}
              initialPath={pendingInitial}
              autoLoad
              onBrowsePathChange={(p) => {
                setBrowsePath(p);
                setManualPath(p);
              }}
              height={340}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {i18n._(msg`library.folderPicker.cancel`)}
          </Button>
          <Button type="button" onClick={handleSelect} disabled={!browsePath}>
            {i18n._(msg`library.folderPicker.select`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PathFieldWithPicker({
  id,
  value,
  onChange,
  placeholder,
  sourceType,
  getSourceConfig,
  onPickerSelect,
  pickerOpen,
  setPickerOpen,
  inputClassName,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  sourceType: SourceType;
  getSourceConfig: () => Record<string, unknown>;
  onPickerSelect: (path: string) => void;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
  inputClassName?: string;
}) {
  const { i18n } = useLingui();
  return (
    <>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn('font-mono text-sm pr-10', inputClassName)}
        />
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label={i18n._(msg`library.browseFolder`)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-ink/60 hover:text-ink/90 hover:bg-ink/[0.06] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          <HugeiconsIcon icon={FolderOpenIcon} className="w-4 h-4" />
        </button>
      </div>
      <FolderPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        sourceType={sourceType}
        getSourceConfig={getSourceConfig}
        initialPath={value}
        onSelect={onPickerSelect}
      />
    </>
  );
}
