import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LoginModal } from '../components/LoginModal';
import { Modal } from '../components/Modal';
import { PageTransition } from '../components/PageTransition';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { useAuth } from '../hooks/use-auth';
import {
  type BrowseInput,
  type BrowseEntry,
  type CreateLibraryInput,
  type DiscoveredHost,
  type Library,
  type LibraryWithStats,
  type TestConnectionInput,
  type UpdateLibraryInput,
  libraryApi,
  libraryKeys,
} from '../lib/api/library';
import { hashName } from '../lib/gradient';
import { cn } from '../lib/utils';

type SourceType = 'local' | 'smb' | 'sftp' | 'webdav' | 's3' | 'ftp' | 'http' | 'gdrive' | 'onedrive' | 'dropbox';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(i > 2 ? 1 : 0)} ${sizes[i]}`;
}

// Derive a subtle accent hue from library name for the top border line
function cardAccentColor(name: string): string {
  const h = hashName(name) % 360;
  return `oklch(55% 0.18 ${h})`;
}

// ─── Source type icon (SVG) ─────────────────────────────────────────────────
function SourceIcon({ sourceType, className }: { sourceType: string; className?: string }) {
  if (sourceType === 'smb' || sourceType === 'sftp' || sourceType === 'ftp') {
    // Network/server icon
    return (
      <svg viewBox="0 0 48 48" fill="none" className={className}>
        <rect x="8" y="10" width="32" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <rect x="8" y="28" width="32" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="14" cy="15" r="1.5" fill="currentColor" />
        <circle cx="14" cy="33" r="1.5" fill="currentColor" />
        <line x1="24" y1="20" x2="24" y2="28" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (sourceType === 'webdav' || sourceType === 's3' || sourceType === 'gdrive' || sourceType === 'onedrive' || sourceType === 'dropbox') {
    // Cloud icon
    return (
      <svg viewBox="0 0 48 48" fill="none" className={className}>
        <path d="M14 34a8 8 0 0 1-.5-16 11 11 0 0 1 21 0A8 8 0 0 1 34 34H14z" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (sourceType === 'http') {
    // Globe icon
    return (
      <svg viewBox="0 0 48 48" fill="none" className={className}>
        <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="1.5" />
        <ellipse cx="24" cy="24" rx="8" ry="16" stroke="currentColor" strokeWidth="1.5" />
        <line x1="8" y1="24" x2="40" y2="24" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  // Default folder icon
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <path
        d="M6 14a3 3 0 0 1 3-3h10l4 4h16a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V14z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

// ─── Source type badge ────────────────────────────────────────────────────────
function SourceBadge({ sourceType }: { sourceType: string }) {
  if (!sourceType || sourceType === 'local') return null;
  const label = sourceType.toUpperCase();
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/[0.08] text-white/50">
      {label}
    </span>
  );
}

// ─── Library card ─────────────────────────────────────────────────────────────
function LibraryCard({
  lib,
  scanning,
  onScan,
  onEdit,
  onDelete,
}: {
  lib: LibraryWithStats;
  scanning: boolean;
  onScan: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const lastScanned = lib.last_scanned_at
    ? new Date(lib.last_scanned_at).toLocaleDateString()
    : i18n._(msg`library.neverScanned`);
  const matchPct = lib.file_count > 0 ? (lib.matched_count / lib.file_count) * 100 : 0;
  const accentColor = cardAccentColor(lib.name);

  return (
    <div
      className="group relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:ring-1 hover:ring-white/[0.12] bg-white/[0.025]"
      onClick={() => navigate({ to: `/libraries/${lib.id}` })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') navigate({ to: `/libraries/${lib.id}` });
      }}
      role="link"
      tabIndex={0}
    >
      {/* Accent top line */}
      <div className="h-[2px]" style={{ backgroundColor: accentColor }} />

      {/* Art area */}
      <div className="relative h-44 overflow-hidden bg-white/[0.02] flex items-center justify-center">
        <SourceIcon sourceType={lib.source_type} className="w-16 h-16 text-white/[0.08]" />

        <AnimatePresence>
          {scanning && (
            <motion.div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(232,143,170,0.18) 50%, transparent 100%)' }}
              initial={{ x: '-100%' }}
              animate={{ x: '200%' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
            />
          )}
        </AnimatePresence>

        {scanning && (
          <div className="absolute top-2.5 right-2.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-mm-accent text-black">
            {i18n._(msg`library.scanning`).toUpperCase()}
          </div>
        )}

        {/* Hover actions */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/60">
          <button type="button" onClick={(e) => { e.stopPropagation(); onScan(); }} disabled={scanning} className="px-3 py-1.5 text-xs font-bold rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-40 cursor-pointer">
            {scanning ? i18n._(msg`library.scanning`) : i18n._(msg`library.scan`)}
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="px-3 py-1.5 text-xs font-bold rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer">
            {i18n._(msg`library.edit`)}
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="px-3 py-1.5 text-xs font-bold rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors cursor-pointer">
            {i18n._(msg`library.delete`)}
          </button>
        </div>

        {/* Match percentage bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-green-500/70" style={{ width: `${matchPct}%` }} />
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm text-white truncate leading-snug">{lib.name}</p>
          {!lib.enabled && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/[0.04] text-white/30">
              {i18n._(msg`library.off`)}
            </span>
          )}
          <SourceBadge sourceType={lib.source_type} />
        </div>
        <p className="text-[11px] font-mono truncate mt-1 text-white/30">{lib.path}</p>
        <p className="text-[11px] text-white/25 mt-2">
          {lib.file_count} files · {formatBytes(lib.total_size_bytes)} · {lastScanned}
        </p>
      </div>
    </div>
  );
}

// ─── Add card ─────────────────────────────────────────────────────────────────
function AddCard({ onClick }: { onClick: () => void }) {
  const { i18n } = useLingui();
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-lg overflow-hidden w-full transition-all duration-200 cursor-pointer border border-dashed border-white/[0.08] hover:border-white/20"
    >
      <div className="h-44 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border border-white/[0.1] flex items-center justify-center group-hover:border-white/20 transition-colors">
            <span className="text-lg text-white/40 group-hover:text-white/60 transition-colors">+</span>
          </div>
          <div>
            <p className="text-sm font-medium text-white/40 group-hover:text-white/60 transition-colors">
              {i18n._(msg`library.addLibrary`)}
            </p>
          </div>
        </div>
      </div>
      <div className="p-4" />
    </button>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { i18n } = useLingui();
  return (
    <div className="flex flex-col items-center justify-center pt-32 pb-16">
      {/* Folder illustration */}
      <div className="mb-8">
        <svg viewBox="0 0 80 80" fill="none" className="w-20 h-20 text-white/[0.07]">
          <path
            d="M10 22a4 4 0 0 1 4-4h16l6 6h28a4 4 0 0 1 4 4v30a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V22z"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="currentColor"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-white/70 mb-2">
        {i18n._(msg`home.library.empty.title`)}
      </h2>
      <p className="text-sm text-white/30 mb-8">
        {i18n._(msg`home.library.empty.subtitle`)}
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="px-5 py-2.5 text-sm font-semibold rounded-md border border-white/[0.12] text-white/70 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
      >
        + {i18n._(msg`library.addLibrary`)}
      </button>
    </div>
  );
}

// ─── Form types ───────────────────────────────────────────────────────────────
interface LibraryFormValues {
  name: string;
  path: string;
  enabled: boolean;
  scan_interval_minutes: number;
  source_type: SourceType;
  // SMB fields
  smb_host: string;
  smb_port: number;
  smb_share: string;
  smb_username: string;
  smb_password: string;
  smb_domain: string;
  // SFTP fields
  sftp_host: string;
  sftp_port: number;
  sftp_username: string;
  sftp_password: string;
  // WebDAV fields
  webdav_url: string;
  webdav_vendor: string;
  webdav_username: string;
  webdav_password: string;
  // S3 fields
  s3_endpoint: string;
  s3_bucket: string;
  s3_region: string;
  s3_access_key: string;
  s3_secret_key: string;
  // FTP fields
  ftp_host: string;
  ftp_port: number;
  ftp_username: string;
  ftp_password: string;
  // HTTP fields
  http_url: string;
  // Rclone import fields
  rclone_remote_name: string;
}

const labelClass = 'text-[10px] font-bold uppercase tracking-[0.2em] text-gray-200';
const inputClass =
  'bg-white/[0.06] border-none focus:ring-1 focus:ring-mm-accent/50 text-white rounded-md';

// ─── Source type selector ─────────────────────────────────────────────────────
function SourceTypeSelector({
  value,
  onChange,
}: {
  value: SourceType;
  onChange: (v: SourceType) => void;
}) {
  const { i18n } = useLingui();
  const types: { key: SourceType; label: string }[] = [
    { key: 'local', label: i18n._(msg`library.sourceType.local`) },
    { key: 'smb', label: i18n._(msg`library.sourceType.smb`) },
    { key: 'sftp', label: i18n._(msg`library.sourceType.sftp`) },
    { key: 'ftp', label: i18n._(msg`library.wizard.ftp.name`) },
    { key: 'http', label: i18n._(msg`library.wizard.http.name`) },
    { key: 'webdav', label: i18n._(msg`library.wizard.webdav.name`) },
    { key: 's3', label: i18n._(msg`library.wizard.s3.name`) },
    { key: 'gdrive', label: i18n._(msg`library.wizard.gdrive.name`) },
    { key: 'onedrive', label: i18n._(msg`library.wizard.onedrive.name`) },
    { key: 'dropbox', label: i18n._(msg`library.wizard.dropbox.name`) },
  ];

  return (
    <div className="space-y-1.5">
      <Label className={labelClass}>{i18n._(msg`library.sourceType`)}</Label>
      <div className="flex flex-wrap gap-1.5">
        {types.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              'px-3 py-2 text-xs font-bold rounded-md transition-colors',
              value === t.key
                ? 'bg-mm-accent text-black'
                : 'bg-white/[0.06] text-gray-200 hover:bg-white/[0.1]'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Test connection button ───────────────────────────────────────────────────
function TestConnectionButton({
  getConnectionInput,
}: {
  getConnectionInput: () => TestConnectionInput;
}) {
  const { i18n } = useLingui();
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const testMutation = useMutation({
    mutationFn: (input: TestConnectionInput) => libraryApi.testConnection(input),
    onSuccess: (data) => setResult(data),
    onError: (err: Error) => setResult({ ok: false, error: err.message }),
  });

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => {
          setResult(null);
          testMutation.mutate(getConnectionInput());
        }}
        disabled={testMutation.isPending}
        className="px-3 py-1.5 text-xs font-bold rounded-md bg-white/[0.06] text-gray-200 hover:bg-white/[0.1] transition-colors disabled:opacity-40"
      >
        {testMutation.isPending
          ? i18n._(msg`library.testConnection.testing`)
          : i18n._(msg`library.testConnection`)}
      </button>
      {result && (
        <p className={cn('text-xs', result.ok ? 'text-green-400' : 'text-red-400')}>
          {result.ok
            ? i18n._(msg`library.testConnection.success`)
            : result.error || i18n._(msg`library.testConnection.failed`)}
        </p>
      )}
    </div>
  );
}

// ─── Folder browser (cascading directory picker) ─────────────────────────────
function FolderBrowser({
  sourceType,
  getSourceConfig,
  currentPath,
  onSelect,
  onShareSelect,
  autoLoad,
}: {
  sourceType: SourceType;
  getSourceConfig: () => Record<string, unknown>;
  currentPath: string;
  onSelect: (path: string) => void;
  /** Called when user selects an SMB share — parent should update smb_share field */
  onShareSelect?: (share: string) => void;
  /** Auto-load root directory on mount */
  autoLoad?: boolean;
}) {
  const { i18n } = useLingui();
  const [browsePath, setBrowsePath] = useState('/');
  const [prevBrowsePath, setPrevBrowsePath] = useState('/');
  const [directories, setDirectories] = useState<BrowseEntry[]>([]);
  const [isShareLevel, setIsShareLevel] = useState(false);
  const [selectedShare, setSelectedShare] = useState('');
  const [, setSelectedPath] = useState('');

  // Track navigation direction for animation
  const browseDirection = browsePath.length >= prevBrowsePath.length ? 1 : -1;

  const browseMutation = useMutation({
    mutationFn: (input: BrowseInput) => libraryApi.browse(input),
    onSuccess: (data) => {
      setDirectories(data.directories ?? []);
    },
  });

  const doBrowse = (path: string, overrideConfig?: Record<string, unknown>) => {
    const config = overrideConfig ?? getSourceConfig();
    const noShare = sourceType === 'smb' && !config.share;
    setIsShareLevel(noShare && (path === '/' || path === ''));
    setPrevBrowsePath(browsePath);
    setBrowsePath(path);
    browseMutation.mutate({
      source_type: sourceType,
      source_config: config,
      path,
    });
  };

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad) {
      doBrowse('/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, [autoLoad]);

  const breadcrumbs = browsePath === '/' ? [] : browsePath.split('/').filter(Boolean);
  const displayBreadcrumbs = selectedShare
    ? [selectedShare, ...breadcrumbs]
    : breadcrumbs;

  const handleCrumbClick = (index: number) => {
    if (selectedShare) {
      if (index === 0) {
        // Click on share name → go back to share list
        setSelectedShare('');
        setSelectedPath('');
        const config = getSourceConfig();
        delete config.share;
        doBrowse('/', config);
        return;
      }
      // Adjust for the share prefix
      const realIndex = index - 1;
      if (realIndex < 0) {
        doBrowse('/');
      } else {
        doBrowse('/' + breadcrumbs.slice(0, realIndex + 1).join('/'));
      }
    } else {
      if (index < 0) {
        doBrowse('/');
      } else {
        doBrowse('/' + breadcrumbs.slice(0, index + 1).join('/'));
      }
    }
  };

  const handleDirectoryClick = (entry: BrowseEntry) => {
    if (isShareLevel && sourceType === 'smb') {
      // User clicked a share — set it and browse inside
      setSelectedShare(entry.name);
      if (onShareSelect) onShareSelect(entry.name);
      // Re-browse with share set in config
      const config = getSourceConfig();
      config.share = entry.name;
      doBrowse('/', config);
      return;
    }
    doBrowse(entry.path);
    setSelectedPath(entry.path);
  };

  const handleSelectFolder = () => {
    onSelect(browsePath);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => doBrowse('/')}
          className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 hover:text-white/60 transition-colors cursor-pointer"
        >
          {i18n._(msg`library.browse.folders`)}
        </button>
      </div>

      {/* Show content only after first browse */}
      {(browseMutation.isSuccess || browseMutation.isPending) && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          {/* Breadcrumb trail */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.06] overflow-x-auto">
            <button
              type="button"
              onClick={() => handleCrumbClick(-1)}
              className={cn(
                'text-xs shrink-0 transition-colors cursor-pointer',
                breadcrumbs.length === 0 ? 'text-white/70 font-medium' : 'text-white/40 hover:text-white/60',
              )}
            >
              /
            </button>
            {displayBreadcrumbs.map((segment, i) => (
              <span key={`${segment}-${i}`} className="flex items-center gap-1 shrink-0">
                <span className="text-white/20 text-[10px]">›</span>
                <button
                  type="button"
                  onClick={() => handleCrumbClick(i)}
                  className={cn(
                    'text-xs transition-colors cursor-pointer',
                    i === displayBreadcrumbs.length - 1
                      ? 'text-white/70 font-medium'
                      : 'text-white/40 hover:text-white/60',
                  )}
                >
                  {segment}
                </button>
              </span>
            ))}
          </div>

          {/* Directory listing — fixed height, no layout shift */}
          <div className="h-[200px] overflow-y-auto overflow-x-hidden relative">
            {browseMutation.isPending && (
              <div className="space-y-1 p-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 rounded bg-white/[0.04] animate-pulse" />
                ))}
              </div>
            )}
            {browseMutation.isSuccess && directories.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-white/30">{i18n._(msg`library.browse.noSubdirectories`)}</p>
              </div>
            )}
            {browseMutation.isSuccess && directories.length > 0 && (
              <div className="py-1">
                {directories.map((entry, i) => (
                  <motion.button
                    key={`${browsePath}-${entry.path}`}
                    type="button"
                    onClick={() => handleDirectoryClick(entry)}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.025, duration: 0.15, ease: 'easeOut' }}
                    className="w-full px-3 py-2 flex items-center gap-2 hover:bg-white/[0.04] rounded cursor-pointer text-sm text-white/70 transition-colors"
                  >
                    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 shrink-0 text-white/30">
                      <path
                        d="M3 6a2 2 0 0 1 2-2h3.5l2 2H15a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                    </svg>
                    <span className="truncate">{entry.name}</span>
                    <span className="ml-auto text-white/20 text-[10px] shrink-0">&#9654;</span>
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          {/* Select button */}
          {browseMutation.isSuccess && !isShareLevel && (
            <div className="px-3 py-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={handleSelectFolder}
                className={cn(
                  'w-full px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer',
                  currentPath === browsePath
                    ? 'bg-mm-accent/10 border border-mm-accent/30 text-mm-accent'
                    : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1]',
                )}
              >
                {currentPath === browsePath ? i18n._(msg`library.browse.selected`) : `${i18n._(msg`library.browse.select`)} ${browsePath}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Network browser (enhanced — auto-discovers, visual cards) ───────────────
function NetworkBrowser({
  onSelect,
  onSelectHost,
  autoDiscover,
}: {
  onSelect: (host: string, port: number, share: string) => void;
  onSelectHost?: (host: string, port: number) => void;
  autoDiscover?: boolean;
}) {
  const { i18n } = useLingui();
  const [expandedIp, setExpandedIp] = useState<string | null>(null);

  const discoverMutation = useMutation({
    mutationFn: () => libraryApi.discoverNetwork(),
  });

  // Auto-discover on mount when requested
  useEffect(() => {
    if (autoDiscover) {
      discoverMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, [autoDiscover]);

  const hosts: DiscoveredHost[] = discoverMutation.data?.hosts ?? [];

  return (
    <div className="space-y-3">
      {/* Scanning state */}
      {discoverMutation.isPending && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-white/50">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="32" strokeLinecap="round" />
            </svg>
            {i18n._(msg`library.discover.scanning`)}
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {discoverMutation.isSuccess && hosts.length === 0 && (
        <div className="text-center py-6">
          <p className="text-xs text-white/40 mb-2">{i18n._(msg`library.discover.noHosts`)}</p>
          <button
            type="button"
            onClick={() => discoverMutation.mutate()}
            className="text-xs text-mm-accent hover:underline"
          >
            {i18n._(msg`library.discover.browse`)}
          </button>
        </div>
      )}

      {/* Discovered host cards */}
      {hosts.length > 0 && (
        <div className="space-y-2">
          {hosts.map((host) => {
            const label = host.hostname || host.ip;
            const isExpanded = expandedIp === host.ip;
            return (
              <div
                key={host.ip}
                className="rounded-lg border border-white/[0.06] hover:bg-white/[0.03] transition-all"
              >
                <button
                  type="button"
                  onClick={() => setExpandedIp(isExpanded ? null : host.ip)}
                  className="w-full flex items-center gap-3 p-3 cursor-pointer"
                >
                  {/* Server icon */}
                  <div className="shrink-0 w-8 h-8 rounded-md bg-white/[0.06] flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white/50">
                      <rect x="4" y="5" width="16" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                      <rect x="4" y="14" width="16" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                      <circle cx="7" cy="7.5" r="0.8" fill="currentColor" />
                      <circle cx="7" cy="16.5" r="0.8" fill="currentColor" />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-white/80">{label}</p>
                  </div>
                  {host.hostname && (
                    <span className="text-[11px] font-mono text-white/30">{host.ip}</span>
                  )}
                  <span
                    className="text-[10px] text-white/30 transition-transform duration-150"
                    style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }}
                  >
                    &#9654;
                  </span>
                </button>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3">
                        {host.shares.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {host.shares.map((share) => (
                              <button
                                key={share}
                                type="button"
                                onClick={() => {
                                  onSelect(host.ip, 445, share);
                                  toast.success(`${i18n._(msg`library.browse.selected`)} ${label}/${share}`);
                                }}
                                className="px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-mm-accent/20 hover:text-mm-accent text-xs text-white/60 transition-colors cursor-pointer"
                              >
                                {share}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-[11px] text-white/30">{i18n._(msg`library.discover.noShares`)}</p>
                            <button
                              type="button"
                              onClick={() => {
                                if (onSelectHost) onSelectHost(host.ip, 445);
                                toast.success(`${i18n._(msg`library.browse.selected`)} ${label}`);
                              }}
                              className="px-3 py-1.5 rounded-md bg-white/[0.08] hover:bg-white/[0.12] text-xs text-white/60 hover:text-white transition-colors cursor-pointer"
                            >
                              {i18n._(msg`library.discover.useThisHost`)}
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          {/* Re-scan link */}
          <button
            type="button"
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending}
            className="text-xs text-white/40 hover:text-white/60 transition-colors disabled:opacity-40"
          >
            {i18n._(msg`library.discover.browse`)}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Library form ─────────────────────────────────────────────────────────────
function LibraryForm({
  defaultValues,
  onSubmit,
  submitLabel,
}: {
  defaultValues: LibraryFormValues;
  onSubmit: (values: LibraryFormValues) => Promise<void>;
  submitLabel: string;
}) {
  const { i18n } = useLingui();
  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => onSubmit(value),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="space-y-5 mt-4"
    >
      {/* Source type selector */}
      <form.Field name="source_type">
        {(field) => (
          <SourceTypeSelector
            value={field.state.value}
            onChange={field.handleChange}
          />
        )}
      </form.Field>

      {/* Name */}
      <form.Field
        name="name"
        validators={{ onChange: ({ value }) => (!value ? i18n._(msg`library.nameRequired`) : undefined) }}
      >
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="lib-name" className={labelClass}>
              {i18n._(msg`library.name`)}
            </Label>
            <Input
              id="lib-name"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="Anime"
              className={inputClass}
            />
            {field.state.meta.errors[0] && (
              <p className="text-xs text-red-400">{String(field.state.meta.errors[0])}</p>
            )}
          </div>
        )}
      </form.Field>

      {/* SMB-specific fields */}
      <form.Subscribe selector={(s) => s.values.source_type}>
        {(sourceType) =>
          sourceType === 'smb' ? (
            <div className="space-y-4 p-4 rounded-md bg-white/[0.03]">
              <form.Field name="smb_host">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className={labelClass}>{i18n._(msg`library.smb.host`)}</Label>
                    <Input
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="192.168.1.100"
                      className={inputClass}
                    />
                  </div>
                )}
              </form.Field>
              <NetworkBrowser
                onSelect={(host, port, share) => {
                  form.setFieldValue('smb_host', host);
                  form.setFieldValue('smb_port', port);
                  form.setFieldValue('smb_share', share);
                }}
              />
              <div className="grid grid-cols-2 gap-3">
                <form.Field name="smb_port">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label className={labelClass}>{i18n._(msg`library.smb.port`)}</Label>
                      <Input
                        type="number"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(Number(e.target.value))}
                        placeholder="445"
                        className={inputClass}
                      />
                    </div>
                  )}
                </form.Field>
                <form.Field name="smb_share">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label className={labelClass}>{i18n._(msg`library.smb.share`)}</Label>
                      <Input
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="media"
                        className={inputClass}
                      />
                    </div>
                  )}
                </form.Field>
              </div>
              <form.Field name="smb_username">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className={labelClass}>{i18n._(msg`library.smb.username`)}</Label>
                    <Input
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="user"
                      className={inputClass}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="smb_password">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className={labelClass}>{i18n._(msg`library.smb.password`)}</Label>
                    <Input
                      type="password"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                      className={inputClass}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="smb_domain">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className={labelClass}>{i18n._(msg`library.smb.domain`)}</Label>
                    <Input
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="WORKGROUP"
                      className={inputClass}
                    />
                  </div>
                )}
              </form.Field>
            </div>
          ) : null
        }
      </form.Subscribe>

      {/* SFTP-specific fields */}
      <form.Subscribe selector={(s) => s.values.source_type}>
        {(sourceType) =>
          sourceType === 'sftp' ? (
            <div className="space-y-4 p-4 rounded-md bg-white/[0.03]">
              <form.Field name="sftp_host">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className={labelClass}>{i18n._(msg`library.sftp.host`)}</Label>
                    <Input
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="192.168.1.100"
                      className={inputClass}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="sftp_port">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className={labelClass}>{i18n._(msg`library.sftp.port`)}</Label>
                    <Input
                      type="number"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(Number(e.target.value))}
                      placeholder="22"
                      className={inputClass}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="sftp_username">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className={labelClass}>{i18n._(msg`library.sftp.username`)}</Label>
                    <Input
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="user"
                      className={inputClass}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="sftp_password">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className={labelClass}>{i18n._(msg`library.sftp.password`)}</Label>
                    <Input
                      type="password"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                      className={inputClass}
                    />
                  </div>
                )}
              </form.Field>
            </div>
          ) : null
        }
      </form.Subscribe>

      {/* Path — with folder browser for non-local sources */}
      <form.Subscribe selector={(s) => s.values}>
        {(values) => (
          <div className="space-y-3">
            <form.Field
              name="path"
              validators={{ onChange: ({ value }) => (!value ? i18n._(msg`library.pathRequired`) : undefined) }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor="lib-path" className={labelClass}>
                    {i18n._(msg`library.path`)}
                  </Label>
                  <Input
                    id="lib-path"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder={values.source_type === 'local' ? '/mnt/media/anime' : '/Video/Anime'}
                    className={cn('font-mono text-sm', inputClass)}
                  />
                  {field.state.meta.errors[0] && (
                    <p className="text-xs text-red-400">{String(field.state.meta.errors[0])}</p>
                  )}
                </div>
              )}
            </form.Field>

            {values.source_type !== 'local' && (
              <FolderBrowser
                sourceType={values.source_type as SourceType}
                getSourceConfig={() => buildSourceConfig(values) ?? {}}
                currentPath={values.path}
                onSelect={(path) => form.setFieldValue('path', path)}
              />
            )}

            {values.source_type !== 'local' && (
              <TestConnectionButton
                getConnectionInput={() => ({
                  source_type: values.source_type,
                  source_config: buildSourceConfig(values) ?? {},
                  path: values.path,
                })}
              />
            )}
          </div>
        )}
      </form.Subscribe>

      {/* Scan interval */}
      <form.Field name="scan_interval_minutes">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="lib-interval" className={labelClass}>
              {i18n._(msg`library.scanInterval`)}
            </Label>
            <Input
              id="lib-interval"
              type="number"
              value={field.state.value}
              onChange={(e) => field.handleChange(Number(e.target.value))}
              min={1}
              max={10080}
              className={inputClass}
            />
          </div>
        )}
      </form.Field>

      {/* Enabled toggle */}
      <form.Field name="enabled">
        {(field) => (
          <div className="flex items-center justify-between py-3 border-t border-white/[0.06]">
            <Label htmlFor="lib-enabled" className={labelClass}>
              {i18n._(msg`library.enabled`)}
            </Label>
            <Switch
              id="lib-enabled"
              checked={field.state.value}
              onCheckedChange={field.handleChange}
            />
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(isSubmitting) => (
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full font-semibold text-white bg-white/[0.1] hover:bg-white/[0.16] border border-white/[0.08] hover:border-white/[0.15] transition-all rounded-lg h-11"
          >
            {isSubmitting ? i18n._(msg`library.saving`) : submitLabel}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

// ─── Rclone remote picker ─────────────────────────────────────────────────────
function RcloneRemotePicker({
  sourceType,
  onSelect,
}: {
  sourceType: SourceType;
  onSelect: (remoteName: string) => void;
}) {
  const { i18n } = useLingui();
  const rcloneType = sourceType === 'gdrive' ? 'drive' : sourceType;
  const { data, isLoading } = useQuery({
    queryKey: libraryKeys.rcloneRemotes(),
    queryFn: libraryApi.listRcloneRemotes,
  });

  const remotes = (data?.remotes ?? []).filter((r) => r.type === rcloneType);

  return (
    <div className="space-y-3 p-4 rounded-md bg-white/[0.03]">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-200">
        {i18n._(msg`library.rclone.availableRemotes`)}
      </p>
      {isLoading && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      )}
      {!isLoading && remotes.length === 0 && (
        <p className="text-xs text-white/40 py-3">
          {i18n._(msg`library.rclone.noRemotes`)}
        </p>
      )}
      {remotes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {remotes.map((remote) => (
            <button
              key={remote.name}
              type="button"
              onClick={() => onSelect(remote.name)}
              className="px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-mm-accent/20 hover:text-mm-accent text-xs text-white/60 transition-colors cursor-pointer"
            >
              {remote.name}
              <span className="ml-1.5 text-white/30">{remote.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add Library Wizard (two-step) ────────────────────────────────────────────
function AddLibraryWizard({
  onSubmit,
}: {
  onSubmit: (values: LibraryFormValues) => Promise<void>;
}) {
  const { i18n } = useLingui();
  const [step, setStep] = useState<'source' | 'configure'>('source');
  const [sourceType, setSourceType] = useState<SourceType>('local');

  // Icon components for reuse
  const folderIcon = (
    <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
      <path d="M6 14a3 3 0 0 1 3-3h10l4 4h16a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V14z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
  const networkIcon = (
    <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
      <rect x="8" y="10" width="32" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8" y="28" width="32" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="15" r="1.5" fill="currentColor" />
      <circle cx="14" cy="33" r="1.5" fill="currentColor" />
      <line x1="24" y1="20" x2="24" y2="28" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
  const terminalIcon = (
    <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
      <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 20h6M12 26h10M12 32h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <text x="30" y="22" fontSize="8" fill="currentColor" fontFamily="monospace">$_</text>
    </svg>
  );
  const cloudIcon = (
    <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
      <path d="M14 34a8 8 0 0 1-.5-16 11 11 0 0 1 21 0A8 8 0 0 1 34 34H14z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
  const globeIcon = (
    <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
      <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="24" cy="24" rx="8" ry="16" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="24" x2="40" y2="24" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
  const bucketIcon = (
    <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
      <path d="M10 16h28l-3 22H13L10 16z" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="24" cy="16" rx="14" ry="4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
  const driveIcon = (
    <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
      <path d="M17.2 10h13.6L42 30H30.8L17.2 10z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 30l5.6-10L24.8 40H13.2L6 30z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M18 40h24l-5.6-10H12.4L18 40z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
  const onedriveIcon = (
    <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
      <path d="M18 34a7 7 0 0 1-1-13.9 9 9 0 0 1 17.2-1A7 7 0 0 1 36 34H18z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 34a5 5 0 0 1 0-10h3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
  const dropboxIcon = (
    <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
      <path d="M14 12l10 7-10 7 10 7-10 7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M34 12l-10 7 10 7-10 7 10 7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );

  type SourceCard = { key: SourceType; name: string; desc: string; icon: React.ReactNode };
  type SourceSection = { label: string; cards: SourceCard[] };

  const sourceSections: SourceSection[] = [
    {
      label: i18n._(msg`library.wizard.section.storage`),
      cards: [
        { key: 'local', name: i18n._(msg`library.sourceType.local`), desc: i18n._(msg`library.wizard.local.desc`), icon: folderIcon },
        { key: 'smb', name: i18n._(msg`library.sourceType.smb`), desc: i18n._(msg`library.wizard.smb.desc`), icon: networkIcon },
        { key: 'sftp', name: i18n._(msg`library.sourceType.sftp`), desc: i18n._(msg`library.wizard.sftp.desc`), icon: terminalIcon },
        { key: 'ftp', name: i18n._(msg`library.wizard.ftp.name`), desc: i18n._(msg`library.wizard.ftp.desc`), icon: terminalIcon },
        { key: 'http', name: i18n._(msg`library.wizard.http.name`), desc: i18n._(msg`library.wizard.http.desc`), icon: globeIcon },
      ],
    },
    {
      label: i18n._(msg`library.wizard.section.cloud`),
      cards: [
        { key: 'webdav', name: i18n._(msg`library.wizard.webdav.name`), desc: i18n._(msg`library.wizard.webdav.desc`), icon: cloudIcon },
        { key: 's3', name: i18n._(msg`library.wizard.s3.name`), desc: i18n._(msg`library.wizard.s3.desc`), icon: bucketIcon },
      ],
    },
    {
      label: i18n._(msg`library.wizard.section.rclone`),
      cards: [
        { key: 'gdrive', name: i18n._(msg`library.wizard.gdrive.name`), desc: i18n._(msg`library.wizard.gdrive.desc`), icon: driveIcon },
        { key: 'onedrive', name: i18n._(msg`library.wizard.onedrive.name`), desc: i18n._(msg`library.wizard.onedrive.desc`), icon: onedriveIcon },
        { key: 'dropbox', name: i18n._(msg`library.wizard.dropbox.name`), desc: i18n._(msg`library.wizard.dropbox.desc`), icon: dropboxIcon },
      ],
    },
  ];

  // Flat list for lookups by key
  const allSourceCards = sourceSections.flatMap((s) => s.cards);

  const handleSelectSource = (key: SourceType) => {
    setSourceType(key);
    setStep('configure');
  };

  const form = useForm({
    defaultValues: {
      ...formDefaultValues(),
      source_type: sourceType,
    },
    onSubmit: async ({ value }) => onSubmit({ ...value, source_type: sourceType }),
  });

  // Sync sourceType into form when it changes
  useEffect(() => {
    form.setFieldValue('source_type', sourceType);
  }, [sourceType, form]);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [smbStep, setSmbStep] = useState<'server' | 'credentials' | 'folder'>('server');
  const [manualSmbHost, setManualSmbHost] = useState('');

  return (
    <div className="mt-2">
      <AnimatePresence mode="wait">
        {/* ─── Step 1: Choose Source ─── */}
        {step === 'source' && (
          <motion.div
            key="source"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.18 }}
            className="space-y-3"
          >
            <p className="text-xs text-white/40 mb-4">
              {i18n._(msg`library.wizard.chooseSource`)}
            </p>
            <div className="max-h-[60vh] overflow-y-auto space-y-5">
              {sourceSections.map((section) => (
                <div key={section.label}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-3">
                    {section.label}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {section.cards.map((card) => (
                      <button
                        key={card.key}
                        type="button"
                        onClick={() => handleSelectSource(card.key)}
                        className="rounded-xl border border-white/[0.06] p-4 hover:border-white/[0.15] hover:bg-white/[0.02] transition-all cursor-pointer text-left flex flex-col gap-3"
                      >
                        <div className="text-white/40">{card.icon}</div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white/80">{card.name}</p>
                          <p className="text-[11px] text-white/35 mt-0.5 leading-snug">{card.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ─── Step 2: Configure ─── */}
        {step === 'configure' && (
          <motion.div
            key="configure"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.18 }}
          >
            {/* Back link */}
            <button
              type="button"
              onClick={() => { setStep('source'); setSmbStep('server'); }}
              className="flex items-center gap-1 text-xs text-white/40 hover:text-white/60 transition-colors mb-4 cursor-pointer"
            >
              <span>&#8592;</span> {i18n._(msg`library.wizard.changeSource`)}
            </button>

            {/* Source label */}
            <div className="flex items-center gap-2 mb-5">
              <div className="text-white/30">
                {allSourceCards.find((c) => c.key === sourceType)?.icon}
              </div>
              <span className="text-xs font-bold uppercase tracking-[0.15em] text-white/40">
                {allSourceCards.find((c) => c.key === sourceType)?.name}
              </span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                form.handleSubmit();
              }}
              className="space-y-5"
            >
              {/* Name — shown for non-SMB sources (SMB has it in sub-step 3) */}
              {sourceType !== 'smb' && (
                <form.Field
                  name="name"
                  validators={{ onChange: ({ value }) => (!value ? i18n._(msg`library.nameRequired`) : undefined) }}
                >
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor="wiz-name" className={labelClass}>
                        {i18n._(msg`library.name`)}
                      </Label>
                      <Input
                        id="wiz-name"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Anime"
                        className={inputClass}
                      />
                      {field.state.meta.errors[0] && (
                        <p className="text-xs text-red-400">{String(field.state.meta.errors[0])}</p>
                      )}
                    </div>
                  )}
                </form.Field>
              )}

              {/* ── SMB: Guided 3-step flow ── */}
              {sourceType === 'smb' && (
                <div className="space-y-5">
                  {/* Step indicator */}
                  <div className="flex items-center gap-2 text-xs">
                    {([
                      { key: 'server' as const, label: i18n._(msg`library.wizard.smb.server`), num: '1' },
                      { key: 'credentials' as const, label: i18n._(msg`library.wizard.smb.credentials`), num: '2' },
                      { key: 'folder' as const, label: i18n._(msg`library.wizard.smb.folder`), num: '3' },
                    ] as const).map((s, idx) => {
                      const steps: ('server' | 'credentials' | 'folder')[] = ['server', 'credentials', 'folder'];
                      const currentIdx = steps.indexOf(smbStep);
                      const stepIdx = steps.indexOf(s.key);
                      const isActive = smbStep === s.key;
                      const isCompleted = stepIdx < currentIdx;
                      return (
                        <span key={s.key} className="flex items-center gap-2">
                          {idx > 0 && <span className="text-white/15">&#8212;</span>}
                          <span className={cn(
                            'font-bold transition-colors',
                            isActive && 'text-white',
                            isCompleted && 'text-green-400',
                            !isActive && !isCompleted && 'text-white/25',
                          )}>
                            {isCompleted ? '\u2713' : s.num}
                          </span>
                          <span className={cn(
                            'transition-colors',
                            isActive && 'text-white/70',
                            isCompleted && 'text-green-400/70',
                            !isActive && !isCompleted && 'text-white/25',
                          )}>
                            {s.label}
                          </span>
                        </span>
                      );
                    })}
                  </div>

                  <AnimatePresence mode="wait">
                    {/* Sub-step 1: Pick a Server */}
                    {smbStep === 'server' && (
                      <motion.div
                        key="smb-server"
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -16 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-4"
                      >
                        <p className="text-xs text-white/40">{i18n._(msg`library.wizard.smb.chooseServer`)}</p>
                        <NetworkBrowser
                          autoDiscover
                          onSelect={(host, port) => {
                            form.setFieldValue('smb_host', host);
                            form.setFieldValue('smb_port', port);
                            setManualSmbHost('');
                            setSmbStep('credentials');
                          }}
                          onSelectHost={(host, port) => {
                            form.setFieldValue('smb_host', host);
                            form.setFieldValue('smb_port', port);
                            setManualSmbHost('');
                            setSmbStep('credentials');
                          }}
                        />

                        {/* Manual entry */}
                        <div className="space-y-2 pt-2">
                          <p className="text-[11px] text-white/30">{i18n._(msg`library.wizard.smb.enterManually`)}</p>
                          <div className="flex gap-2">
                            <Input
                              value={manualSmbHost}
                              onChange={(e) => setManualSmbHost(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && manualSmbHost.trim()) {
                                  e.preventDefault();
                                  form.setFieldValue('smb_host', manualSmbHost.trim());
                                  form.setFieldValue('smb_port', 445);
                                  setSmbStep('credentials');
                                }
                              }}
                              placeholder="192.168.1.100"
                              className={cn('flex-1', inputClass)}
                            />
                            <button
                              type="button"
                              disabled={!manualSmbHost.trim()}
                              onClick={() => {
                                form.setFieldValue('smb_host', manualSmbHost.trim());
                                form.setFieldValue('smb_port', 445);
                                setSmbStep('credentials');
                              }}
                              className="px-4 py-2 text-xs font-bold rounded-md bg-white/[0.08] text-white/60 hover:bg-white/[0.12] hover:text-white transition-colors disabled:opacity-30 cursor-pointer"
                            >
                              {i18n._(msg`library.wizard.smb.next`)}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Sub-step 2: Enter Credentials */}
                    {smbStep === 'credentials' && (
                      <motion.div
                        key="smb-credentials"
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -16 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-4"
                      >
                        {/* Selected server summary */}
                        <form.Subscribe selector={(s) => ({ host: s.values.smb_host, port: s.values.smb_port })}>
                          {({ host, port }) => (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                              <div className="shrink-0 w-7 h-7 rounded-md bg-white/[0.06] flex items-center justify-center">
                                <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-white/50">
                                  <rect x="4" y="5" width="16" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                                  <rect x="4" y="14" width="16" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                                  <circle cx="7" cy="7.5" r="0.8" fill="currentColor" />
                                  <circle cx="7" cy="16.5" r="0.8" fill="currentColor" />
                                </svg>
                              </div>
                              <span className="text-sm text-white/70 font-medium">{host}</span>
                              {port !== 445 && <span className="text-[11px] text-white/30">:{port}</span>}
                              <button
                                type="button"
                                onClick={() => setSmbStep('server')}
                                className="ml-auto text-[11px] text-mm-accent hover:underline cursor-pointer"
                              >
                                {i18n._(msg`library.wizard.smb.change`)}
                              </button>
                            </div>
                          )}
                        </form.Subscribe>

                        <div className="space-y-4 p-4 rounded-md bg-white/[0.03]">
                          <form.Field name="smb_username">
                            {(field) => (
                              <div className="space-y-1.5">
                                <Label className={labelClass}>{i18n._(msg`library.smb.username`)}</Label>
                                <Input
                                  value={field.state.value}
                                  onChange={(e) => field.handleChange(e.target.value)}
                                  placeholder="user"
                                  className={inputClass}
                                />
                              </div>
                            )}
                          </form.Field>
                          <form.Field name="smb_password">
                            {(field) => (
                              <div className="space-y-1.5">
                                <Label className={labelClass}>{i18n._(msg`library.smb.password`)}</Label>
                                <Input
                                  type="password"
                                  value={field.state.value}
                                  onChange={(e) => field.handleChange(e.target.value)}
                                  placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                                  className={inputClass}
                                />
                              </div>
                            )}
                          </form.Field>
                          <form.Field name="smb_domain">
                            {(field) => (
                              <div className="space-y-1.5">
                                <Label className={labelClass}>
                                  {i18n._(msg`library.smb.domain`)}
                                  <span className="ml-1.5 text-white/25 normal-case tracking-normal font-normal">({i18n._(msg`library.wizard.optional`)})</span>
                                </Label>
                                <Input
                                  value={field.state.value}
                                  onChange={(e) => field.handleChange(e.target.value)}
                                  placeholder="WORKGROUP"
                                  className={inputClass}
                                />
                              </div>
                            )}
                          </form.Field>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSmbStep('folder')}
                          className="w-full px-4 py-2.5 text-sm font-bold rounded-lg bg-white/[0.1] hover:bg-white/[0.16] border border-white/[0.08] hover:border-white/[0.15] text-white transition-all cursor-pointer"
                        >
                          {i18n._(msg`library.wizard.smb.connect`)}
                        </button>
                      </motion.div>
                    )}

                    {/* Sub-step 3: Browse & Select Folder */}
                    {smbStep === 'folder' && (
                      <motion.div
                        key="smb-folder"
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -16 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-4"
                      >
                        {/* Summary line */}
                        <form.Subscribe selector={(s) => ({ host: s.values.smb_host, user: s.values.smb_username })}>
                          {({ host, user }) => (
                            <div className="flex items-center gap-2 text-xs text-white/40">
                              <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-white/30">
                                <rect x="4" y="5" width="16" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                                <rect x="4" y="14" width="16" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                              </svg>
                              <span>{host}</span>
                              {user && <span>{i18n._(msg`library.wizard.smb.asUser`)} {user}</span>}
                              <button
                                type="button"
                                onClick={() => setSmbStep('credentials')}
                                className="ml-auto text-[11px] text-mm-accent hover:underline cursor-pointer"
                              >
                                {i18n._(msg`library.wizard.smb.change`)}
                              </button>
                            </div>
                          )}
                        </form.Subscribe>

                        {/* Folder browser — auto-loads shares */}
                        <form.Subscribe selector={(s) => s.values}>
                          {(values) => (
                            <FolderBrowser
                              sourceType="smb"
                              autoLoad
                              getSourceConfig={() => buildSourceConfig({ ...values, source_type: 'smb' }) ?? {}}
                              currentPath={values.path}
                              onShareSelect={(share) => {
                                form.setFieldValue('smb_share', share);
                              }}
                              onSelect={(path) => {
                                form.setFieldValue('path', path);
                              }}
                            />
                          )}
                        </form.Subscribe>

                        {/* Library name */}
                        <form.Field
                          name="name"
                          validators={{ onChange: ({ value }) => (!value ? i18n._(msg`library.nameRequired`) : undefined) }}
                        >
                          {(field) => (
                            <div className="space-y-1.5">
                              <Label htmlFor="wiz-name-smb" className={labelClass}>
                                {i18n._(msg`library.name`)}
                                <span className="ml-2 font-normal normal-case tracking-normal text-white/25">
                                    — {i18n._(msg`library.wizard.smb.nameHint`)}
                                </span>
                              </Label>
                              <Input
                                id="wiz-name-smb"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                placeholder="e.g. Anime Collection"
                                className={inputClass}
                              />
                              {field.state.meta.errors[0] && (
                                <p className="text-xs text-red-400">{String(field.state.meta.errors[0])}</p>
                              )}
                            </div>
                          )}
                        </form.Field>

                        {/* Submit */}
                        <form.Subscribe selector={(s) => ({ isSubmitting: s.isSubmitting, path: s.values.path })}>
                          {({ isSubmitting, path }) => (
                            <Button
                              type="submit"
                              disabled={isSubmitting || !path}
                              className="w-full font-semibold text-white bg-white/[0.1] hover:bg-white/[0.16] border border-white/[0.08] hover:border-white/[0.15] transition-all rounded-lg h-11"
                            >
                              {isSubmitting ? i18n._(msg`library.saving`) : i18n._(msg`library.addLibrary`)}
                            </Button>
                          )}
                        </form.Subscribe>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* ── SFTP fields ── */}
              {sourceType === 'sftp' && (
                <div className="space-y-4 p-4 rounded-md bg-white/[0.03]">
                  <form.Field name="sftp_host">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.sftp.host`)}</Label>
                        <Input
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="192.168.1.100"
                          className={inputClass}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="sftp_port">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.sftp.port`)}</Label>
                        <Input
                          type="number"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(Number(e.target.value))}
                          placeholder="22"
                          className={inputClass}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="sftp_username">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.sftp.username`)}</Label>
                        <Input
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="user"
                          className={inputClass}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="sftp_password">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.sftp.password`)}</Label>
                        <Input
                          type="password"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                          className={inputClass}
                        />
                      </div>
                    )}
                  </form.Field>
                </div>
              )}

              {/* ── WebDAV fields ── */}
              {sourceType === 'webdav' && (
                <div className="space-y-4 p-4 rounded-md bg-white/[0.03]">
                  <form.Field name="webdav_url">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.webdav.url`)}</Label>
                        <Input
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="https://nextcloud.example.com/remote.php/dav/files/user/"
                          className={cn('font-mono text-sm', inputClass)}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="webdav_vendor">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.webdav.vendor`)}</Label>
                        <div className="flex gap-1.5">
                          {(['nextcloud', 'owncloud', 'other'] as const).map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => field.handleChange(v)}
                              className={cn(
                                'flex-1 px-3 py-2 text-xs font-bold rounded-md transition-colors',
                                field.state.value === v
                                  ? 'bg-mm-accent text-black'
                                  : 'bg-white/[0.06] text-gray-200 hover:bg-white/[0.1]'
                              )}
                            >
                              {v === 'nextcloud' ? 'Nextcloud' : v === 'owncloud' ? 'OwnCloud' : i18n._(msg`library.webdav.vendorOther`)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="webdav_username">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.webdav.username`)}</Label>
                        <Input
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="user"
                          className={inputClass}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="webdav_password">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.webdav.password`)}</Label>
                        <Input
                          type="password"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                          className={inputClass}
                        />
                      </div>
                    )}
                  </form.Field>
                </div>
              )}

              {/* ── S3 fields ── */}
              {sourceType === 's3' && (
                <div className="space-y-4 p-4 rounded-md bg-white/[0.03]">
                  <form.Field name="s3_endpoint">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.s3.endpoint`)}</Label>
                        <Input
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="https://s3.amazonaws.com"
                          className={cn('font-mono text-sm', inputClass)}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="s3_bucket">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.s3.bucket`)}</Label>
                        <Input
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="my-bucket"
                          className={inputClass}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="s3_region">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.s3.region`)}</Label>
                        <Input
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="us-east-1"
                          className={inputClass}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="s3_access_key">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.s3.accessKey`)}</Label>
                        <Input
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="AKIAIOSFODNN7EXAMPLE"
                          className={cn('font-mono text-sm', inputClass)}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="s3_secret_key">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.s3.secretKey`)}</Label>
                        <Input
                          type="password"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                          className={inputClass}
                        />
                      </div>
                    )}
                  </form.Field>
                </div>
              )}

              {/* ── FTP fields ── */}
              {sourceType === 'ftp' && (
                <div className="space-y-4 p-4 rounded-md bg-white/[0.03]">
                  <form.Field name="ftp_host">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.ftp.host`)}</Label>
                        <Input
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="ftp.example.com"
                          className={inputClass}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="ftp_port">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.ftp.port`)}</Label>
                        <Input
                          type="number"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(Number(e.target.value))}
                          placeholder="21"
                          className={inputClass}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="ftp_username">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.ftp.username`)}</Label>
                        <Input
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="user"
                          className={inputClass}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="ftp_password">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.ftp.password`)}</Label>
                        <Input
                          type="password"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                          className={inputClass}
                        />
                      </div>
                    )}
                  </form.Field>
                </div>
              )}

              {/* ── HTTP fields ── */}
              {sourceType === 'http' && (
                <div className="space-y-4 p-4 rounded-md bg-white/[0.03]">
                  <form.Field name="http_url">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.http.url`)}</Label>
                        <Input
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="https://example.com/media/"
                          className={cn('font-mono text-sm', inputClass)}
                        />
                        <p className="text-[11px] text-white/30">{i18n._(msg`library.http.readOnly`)}</p>
                      </div>
                    )}
                  </form.Field>
                </div>
              )}

              {/* ── Rclone import fields (gdrive/onedrive/dropbox) ── */}
              {(sourceType === 'gdrive' || sourceType === 'onedrive' || sourceType === 'dropbox') && (
                <RcloneRemotePicker
                  sourceType={sourceType}
                  onSelect={(remoteName) => form.setFieldValue('rclone_remote_name', remoteName)}
                />
              )}
              {(sourceType === 'gdrive' || sourceType === 'onedrive' || sourceType === 'dropbox') && (
                <div className="space-y-4 p-4 rounded-md bg-white/[0.03]">
                  <form.Field name="rclone_remote_name">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label className={labelClass}>{i18n._(msg`library.rclone.remoteName`)}</Label>
                        <Input
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="my-gdrive"
                          className={cn('font-mono text-sm', inputClass)}
                        />
                      </div>
                    )}
                  </form.Field>
                </div>
              )}

              {/* Path — with folder browser for non-local, non-SMB sources */}
              {sourceType !== 'smb' && (
                <form.Subscribe selector={(s) => s.values}>
                  {(values) => (
                    <div className="space-y-3">
                      <form.Field
                        name="path"
                        validators={{ onChange: ({ value }) => (!value ? i18n._(msg`library.pathRequired`) : undefined) }}
                      >
                        {(field) => (
                          <div className="space-y-1.5">
                            <Label htmlFor="wiz-path" className={labelClass}>
                              {i18n._(msg`library.path`)}
                            </Label>
                            <Input
                              id="wiz-path"
                              value={field.state.value}
                              onChange={(e) => field.handleChange(e.target.value)}
                              placeholder={sourceType === 'local' ? '/mnt/media/anime' : '/Video/Anime'}
                              className={cn('font-mono text-sm', inputClass)}
                            />
                            {field.state.meta.errors[0] && (
                              <p className="text-xs text-red-400">{String(field.state.meta.errors[0])}</p>
                            )}
                          </div>
                        )}
                      </form.Field>

                      {/* Folder browser for non-local source types */}
                      {sourceType !== 'local' && (
                        <FolderBrowser
                          sourceType={sourceType}
                          getSourceConfig={() => buildSourceConfig({ ...values, source_type: sourceType }) ?? {}}
                          currentPath={values.path}
                          onSelect={(path) => form.setFieldValue('path', path)}
                        />
                      )}

                      {/* Test connection for non-local */}
                      {sourceType !== 'local' && (
                        <TestConnectionButton
                          getConnectionInput={() => ({
                            source_type: sourceType,
                            source_config: buildSourceConfig({ ...values, source_type: sourceType }) ?? {},
                            path: values.path,
                          })}
                        />
                      )}
                    </div>
                  )}
                </form.Subscribe>
              )}

              {/* Advanced section + Submit — hidden for SMB (handled in sub-step 3) */}
              {sourceType !== 'smb' && (
                <>
                  <div className="border-t border-white/[0.06] pt-3">
                    <button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors cursor-pointer"
                    >
                      <span
                        className="text-[9px] transition-transform duration-150"
                        style={{ transform: showAdvanced ? 'rotate(90deg)' : undefined }}
                      >
                        &#9654;
                      </span>
                      {i18n._(msg`library.wizard.advanced`)}
                    </button>
                    <AnimatePresence>
                      {showAdvanced && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-4 pt-4">
                            <form.Field name="scan_interval_minutes">
                              {(field) => (
                                <div className="space-y-1.5">
                                  <Label htmlFor="wiz-interval" className={labelClass}>
                                    {i18n._(msg`library.scanInterval`)}
                                  </Label>
                                  <Input
                                    id="wiz-interval"
                                    type="number"
                                    value={field.state.value}
                                    onChange={(e) => field.handleChange(Number(e.target.value))}
                                    min={1}
                                    max={10080}
                                    className={inputClass}
                                  />
                                </div>
                              )}
                            </form.Field>
                            <form.Field name="enabled">
                              {(field) => (
                                <div className="flex items-center justify-between py-1">
                                  <Label htmlFor="wiz-enabled" className={labelClass}>
                                    {i18n._(msg`library.enabled`)}
                                  </Label>
                                  <Switch
                                    id="wiz-enabled"
                                    checked={field.state.value}
                                    onCheckedChange={field.handleChange}
                                  />
                                </div>
                              )}
                            </form.Field>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Submit */}
                  <form.Subscribe selector={(s) => s.isSubmitting}>
                    {(isSubmitting) => (
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full font-semibold text-white bg-white/[0.1] hover:bg-white/[0.16] border border-white/[0.08] hover:border-white/[0.15] transition-all rounded-lg h-11"
                      >
                        {isSubmitting ? i18n._(msg`library.saving`) : i18n._(msg`library.addLibrary`)}
                      </Button>
                    )}
                  </form.Subscribe>
                </>
              )}
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Helpers to build source_config from form values ──────────────────────────
function buildSourceConfig(values: LibraryFormValues): Record<string, unknown> | undefined {
  if (values.source_type === 'smb') {
    return {
      host: values.smb_host,
      port: values.smb_port,
      share: values.smb_share,
      username: values.smb_username,
      password: values.smb_password,
      domain: values.smb_domain,
    };
  }
  if (values.source_type === 'sftp') {
    return {
      host: values.sftp_host,
      port: values.sftp_port,
      username: values.sftp_username,
      password: values.sftp_password,
    };
  }
  if (values.source_type === 'webdav') {
    return {
      url: values.webdav_url,
      vendor: values.webdav_vendor,
      username: values.webdav_username,
      password: values.webdav_password,
    };
  }
  if (values.source_type === 's3') {
    return {
      endpoint: values.s3_endpoint,
      bucket: values.s3_bucket,
      region: values.s3_region,
      access_key: values.s3_access_key,
      secret_key: values.s3_secret_key,
    };
  }
  if (values.source_type === 'ftp') {
    return {
      host: values.ftp_host,
      port: values.ftp_port,
      username: values.ftp_username,
      password: values.ftp_password,
    };
  }
  if (values.source_type === 'http') {
    return {
      url: values.http_url,
    };
  }
  if (values.source_type === 'gdrive' || values.source_type === 'onedrive' || values.source_type === 'dropbox') {
    return {
      remote_name: values.rclone_remote_name,
    };
  }
  return undefined;
}

function formDefaultValues(lib?: Library): LibraryFormValues {
  return {
    name: lib?.name ?? '',
    path: lib?.path ?? '',
    enabled: lib ? lib.enabled === 1 : true,
    scan_interval_minutes: lib?.scan_interval_minutes ?? 60,
    source_type: (lib?.source_type as SourceType) || 'local',
    smb_host: '',
    smb_port: 445,
    smb_share: '',
    smb_username: '',
    smb_password: '',
    smb_domain: '',
    sftp_host: '',
    sftp_port: 22,
    sftp_username: '',
    sftp_password: '',
    webdav_url: '',
    webdav_vendor: 'other',
    webdav_username: '',
    webdav_password: '',
    s3_endpoint: '',
    s3_bucket: '',
    s3_region: '',
    s3_access_key: '',
    s3_secret_key: '',
    ftp_host: '',
    ftp_port: 21,
    ftp_username: '',
    ftp_password: '',
    http_url: '',
    rclone_remote_name: '',
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function LibrariesPage() {
  const { i18n } = useLingui();
  const { isAuthenticated } = useAuth();
  const [showLogin, setShowLogin] = useState(!isAuthenticated);
  const queryClient = useQueryClient();
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit' | null>(null);
  const [editLib, setEditLib] = useState<LibraryWithStats | null>(null);
  const [deleteLib, setDeleteLib] = useState<LibraryWithStats | null>(null);
  const [scanningId, setScanningId] = useState<string | null>(null);

  // Sync login modal visibility with auth state
  useEffect(() => {
    if (isAuthenticated) setShowLogin(false);
    else setShowLogin(true);
  }, [isAuthenticated]);

  const { data: libraries = [], isLoading } = useQuery({
    queryKey: libraryKeys.list(),
    queryFn: libraryApi.list,
    enabled: isAuthenticated,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateLibraryInput) => libraryApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.list() });
      setDrawerMode(null);
      toast.success(i18n._(msg`library.toast.added`));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateLibraryInput }) =>
      libraryApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.list() });
      setDrawerMode(null);
      setEditLib(null);
      toast.success(i18n._(msg`library.toast.updated`));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => libraryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.list() });
      setDeleteLib(null);
      toast.success(i18n._(msg`library.toast.deleted`));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const scanMutation = useMutation({
    mutationFn: async (id: string) => {
      setScanningId(id);
      return libraryApi.scan(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.list() });
      setScanningId(null);
      toast.success(i18n._(msg`library.toast.scanComplete`));
    },
    onError: (err: Error) => {
      setScanningId(null);
      toast.error(`${i18n._(msg`library.toast.scanFailed`)}: ${err.message}`);
    },
  });

  const skeletonCards = [1, 2, 3, 4];
  const hasLibraries = !isLoading && libraries.length > 0;
  const isEmpty = !isLoading && libraries.length === 0;

  // Not authenticated — show prompt
  if (!isAuthenticated) {
    return (
      <PageTransition>
        <div className="min-h-screen flex flex-col items-center justify-center px-4">
          <div className="mb-8">
            <svg viewBox="0 0 80 80" fill="none" className="w-20 h-20 text-white/[0.07]">
              <path
                d="M40 10a14 14 0 0 1 14 14v6H26v-6A14 14 0 0 1 40 10z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <rect x="16" y="30" width="48" height="36" rx="4" stroke="currentColor" strokeWidth="1.5" fill="currentColor" />
              <circle cx="40" cy="46" r="4" fill="oklch(12% 0.01 260)" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white/70 mb-2">
            {i18n._(msg`auth.libraries.signInTitle`)}
          </h2>
          <p className="text-sm text-white/30 mb-8 text-center max-w-xs">
            {i18n._(msg`auth.libraries.signInSubtitle`)}
          </p>
          <button
            type="button"
            onClick={() => setShowLogin(true)}
            className="px-5 py-2.5 text-sm font-bold rounded-md text-black bg-mm-accent hover:opacity-90 transition-opacity cursor-pointer"
          >
            {i18n._(msg`auth.login.submit`)}
          </button>
          <LoginModal
            open={showLogin}
            onClose={() => setShowLogin(false)}
          />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Header — only show when libraries exist */}
        {(hasLibraries || isLoading) && (
          <div className="px-8 pt-14 pb-8">
            <div className="flex items-end justify-between">
              <h1 className="text-4xl font-bold text-white tracking-tight">
                {i18n._(msg`library.pageTitle`)}
              </h1>
              <button
                type="button"
                onClick={() => setDrawerMode('add')}
                className="px-4 py-2 text-sm font-medium rounded-md border border-white/[0.12] text-white/70 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
              >
                + {i18n._(msg`library.addLibrary`)}
              </button>
            </div>
          </div>
        )}

        {/* Grid */}
        <div className="px-8 pb-16">
          {isLoading ? (
            <div
              className="grid gap-5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
            >
              {skeletonCards.map((i) => (
                <div key={i} className="rounded-lg overflow-hidden animate-pulse bg-white/[0.025]">
                  <div className="h-[2px] bg-white/[0.04]" />
                  <div className="h-44 bg-white/[0.02]" />
                  <div className="p-4">
                    <div
                      className="h-3 rounded mb-2"
                      style={{ backgroundColor: 'oklch(18% 0.01 280)', width: '55%' }}
                    />
                    <div
                      className="h-2 rounded"
                      style={{ backgroundColor: 'oklch(15% 0.01 280)', width: '75%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : isEmpty ? (
            <EmptyState onAdd={() => setDrawerMode('add')} />
          ) : (
            <motion.div
              className="grid gap-5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
            >
              <AnimatePresence mode="popLayout">
                {libraries.map((lib, i) => (
                  <motion.div
                    key={lib.id}
                    layout
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={{
                      delay: i * 0.04,
                      duration: 0.28,
                      ease: [0.25, 0.46, 0.45, 0.94],
                    }}
                  >
                    <LibraryCard
                      lib={lib}
                      scanning={scanningId === lib.id}
                      onScan={() => scanMutation.mutate(lib.id)}
                      onEdit={() => {
                        setEditLib(lib);
                        setDrawerMode('edit');
                      }}
                      onDelete={() => setDeleteLib(lib)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Add card always last */}
              <motion.div
                layout
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: libraries.length * 0.04, duration: 0.28 }}
              >
                <AddCard onClick={() => setDrawerMode('add')} />
              </motion.div>
            </motion.div>
          )}
        </div>

        {/* Add library modal (wizard, larger) */}
        <Modal
          open={drawerMode === 'add'}
          onClose={() => setDrawerMode(null)}
          title={i18n._(msg`library.addLibrary`)}
          size="lg"
        >
          <AddLibraryWizard
            onSubmit={async (values) => {
              await createMutation.mutateAsync({
                name: values.name,
                path: values.path,
                scan_interval_minutes: values.scan_interval_minutes,
                source_type: values.source_type,
                source_config: buildSourceConfig(values),
              });
            }}
          />
        </Modal>

        {/* Edit library modal (original form, small) */}
        <Modal
          open={drawerMode === 'edit' && !!editLib}
          onClose={() => {
            setDrawerMode(null);
            setEditLib(null);
          }}
          title={i18n._(msg`library.editLibrary`)}
          size="sm"
        >
          {editLib && (
            <LibraryForm
              defaultValues={formDefaultValues(editLib)}
              submitLabel={i18n._(msg`library.saveChanges`)}
              onSubmit={async (values) => {
                await updateMutation.mutateAsync({
                  id: editLib.id,
                  input: {
                    name: values.name,
                    path: values.path,
                    enabled: values.enabled,
                    scan_interval_minutes: values.scan_interval_minutes,
                    source_type: values.source_type,
                    source_config: buildSourceConfig(values),
                  },
                });
              }}
            />
          )}
        </Modal>

        {/* Delete confirmation modal */}
        <Modal
          open={!!deleteLib}
          onClose={() => setDeleteLib(null)}
          title={`${i18n._(msg`library.delete`)} "${deleteLib?.name}"?`}
          size="sm"
        >
          <p className="text-[13px] text-mm-text-secondary mb-5">
            {i18n._(msg`library.deleteConfirm`)}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteLib(null)}
              className="px-4 py-2 text-[13px] font-medium rounded-md bg-white/[0.06] text-white hover:bg-white/[0.1] transition-colors"
            >
              {i18n._(msg`library.cancel`)}
            </button>
            <button
              type="button"
              onClick={() => {
                if (deleteLib) deleteMutation.mutate(deleteLib.id);
              }}
              className="px-4 py-2 text-[13px] font-medium rounded-md text-white transition-colors"
              style={{ backgroundColor: 'oklch(45% 0.22 25)' }}
            >
              {i18n._(msg`library.delete`)}
            </button>
          </div>
        </Modal>
      </div>
    </PageTransition>
  );
}
