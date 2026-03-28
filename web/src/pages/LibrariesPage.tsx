import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '../components/Modal';
import { PageTransition } from '../components/PageTransition';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import {
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

type SourceType = 'local' | 'smb' | 'sftp';

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
  if (sourceType === 'smb' || sourceType === 'sftp') {
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
  ];

  return (
    <div className="space-y-1.5">
      <Label className={labelClass}>{i18n._(msg`library.sourceType`)}</Label>
      <div className="flex gap-1.5">
        {types.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              'flex-1 px-3 py-2 text-xs font-bold rounded-md transition-colors',
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

// ─── Network browser (enhanced — auto-discovers, visual cards) ───────────────
function NetworkBrowser({
  onSelect,
  autoDiscover,
}: {
  onSelect: (host: string, port: number, share: string) => void;
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
                                  toast.success(`Selected ${label}/${share}`);
                                }}
                                className="px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-mm-accent/20 hover:text-mm-accent text-xs text-white/60 transition-colors cursor-pointer"
                              >
                                {share}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-white/30">No shares found</p>
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

      {/* Path */}
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
              placeholder="/mnt/media/anime"
              className={cn('font-mono text-sm', inputClass)}
            />
            {field.state.meta.errors[0] && (
              <p className="text-xs text-red-400">{String(field.state.meta.errors[0])}</p>
            )}
          </div>
        )}
      </form.Field>

      {/* Test connection for non-local */}
      <form.Subscribe selector={(s) => s.values}>
        {(values) =>
          values.source_type !== 'local' ? (
            <TestConnectionButton
              getConnectionInput={() => {
                if (values.source_type === 'smb') {
                  return {
                    source_type: 'smb',
                    source_config: {
                      host: values.smb_host,
                      port: values.smb_port,
                      share: values.smb_share,
                      username: values.smb_username,
                      password: values.smb_password,
                      domain: values.smb_domain,
                    },
                    path: values.path,
                  };
                }
                return {
                  source_type: 'sftp',
                  source_config: {
                    host: values.sftp_host,
                    port: values.sftp_port,
                    username: values.sftp_username,
                    password: values.sftp_password,
                  },
                  path: values.path,
                };
              }}
            />
          ) : null
        }
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
            className="w-full font-bold text-black bg-mm-accent"
          >
            {isSubmitting ? i18n._(msg`library.saving`) : submitLabel}
          </Button>
        )}
      </form.Subscribe>
    </form>
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

  const sourceCards: { key: SourceType; name: string; desc: string; icon: React.ReactNode }[] = [
    {
      key: 'local',
      name: i18n._(msg`library.sourceType.local`),
      desc: i18n._(msg`library.wizard.local.desc`),
      icon: (
        <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
          <path
            d="M6 14a3 3 0 0 1 3-3h10l4 4h16a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V14z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      ),
    },
    {
      key: 'smb',
      name: i18n._(msg`library.sourceType.smb`),
      desc: i18n._(msg`library.wizard.smb.desc`),
      icon: (
        <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
          <rect x="8" y="10" width="32" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <rect x="8" y="28" width="32" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="14" cy="15" r="1.5" fill="currentColor" />
          <circle cx="14" cy="33" r="1.5" fill="currentColor" />
          <line x1="24" y1="20" x2="24" y2="28" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ),
    },
    {
      key: 'sftp',
      name: i18n._(msg`library.sourceType.sftp`),
      desc: i18n._(msg`library.wizard.sftp.desc`),
      icon: (
        <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
          <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 20h6M12 26h10M12 32h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <text x="30" y="22" fontSize="8" fill="currentColor" fontFamily="monospace">$_</text>
        </svg>
      ),
    },
  ];

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
  const [showManualSmb, setShowManualSmb] = useState(false);

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
            {sourceCards.map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => handleSelectSource(card.key)}
                className="w-full rounded-xl border border-white/[0.06] p-5 hover:border-white/[0.15] transition-all cursor-pointer text-left flex items-center gap-4"
              >
                <div className="shrink-0 text-white/40">{card.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white/80">{card.name}</p>
                  <p className="text-xs text-white/35 mt-0.5">{card.desc}</p>
                </div>
                <span className="text-white/20 text-sm">&#8250;</span>
              </button>
            ))}
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
              onClick={() => { setStep('source'); setShowManualSmb(false); }}
              className="flex items-center gap-1 text-xs text-white/40 hover:text-white/60 transition-colors mb-4 cursor-pointer"
            >
              <span>&#8592;</span> {i18n._(msg`library.wizard.changeSource`)}
            </button>

            {/* Source label */}
            <div className="flex items-center gap-2 mb-5">
              <div className="text-white/30">
                {sourceCards.find((c) => c.key === sourceType)?.icon}
              </div>
              <span className="text-xs font-bold uppercase tracking-[0.15em] text-white/40">
                {sourceCards.find((c) => c.key === sourceType)?.name}
              </span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                form.handleSubmit();
              }}
              className="space-y-5"
            >
              {/* Name */}
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

              {/* ── SMB: Network Discovery prominent ── */}
              {sourceType === 'smb' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-200 mb-2">
                      {i18n._(msg`library.discover.browse`)}
                    </p>
                    <NetworkBrowser
                      autoDiscover
                      onSelect={(host, port, share) => {
                        form.setFieldValue('smb_host', host);
                        form.setFieldValue('smb_port', port);
                        form.setFieldValue('smb_share', share);
                        setShowManualSmb(false);
                      }}
                    />
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-white/[0.06]" />
                    <button
                      type="button"
                      onClick={() => setShowManualSmb(!showManualSmb)}
                      className="text-[11px] text-white/30 hover:text-white/50 transition-colors cursor-pointer"
                    >
                      {showManualSmb ? i18n._(msg`library.wizard.hideManual`) : i18n._(msg`library.wizard.orManual`)}
                    </button>
                    <div className="flex-1 h-px bg-white/[0.06]" />
                  </div>

                  {/* Manual SMB fields */}
                  <AnimatePresence>
                    {showManualSmb && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
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

              {/* Path */}
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
                      placeholder="/mnt/media/anime"
                      className={cn('font-mono text-sm', inputClass)}
                    />
                    {field.state.meta.errors[0] && (
                      <p className="text-xs text-red-400">{String(field.state.meta.errors[0])}</p>
                    )}
                  </div>
                )}
              </form.Field>

              {/* Test connection for non-local */}
              {sourceType !== 'local' && (
                <form.Subscribe selector={(s) => s.values}>
                  {(values) => (
                    <TestConnectionButton
                      getConnectionInput={() => {
                        if (sourceType === 'smb') {
                          return {
                            source_type: 'smb',
                            source_config: {
                              host: values.smb_host,
                              port: values.smb_port,
                              share: values.smb_share,
                              username: values.smb_username,
                              password: values.smb_password,
                              domain: values.smb_domain,
                            },
                            path: values.path,
                          };
                        }
                        return {
                          source_type: 'sftp',
                          source_config: {
                            host: values.sftp_host,
                            port: values.sftp_port,
                            username: values.sftp_username,
                            password: values.sftp_password,
                          },
                          path: values.path,
                        };
                      }}
                    />
                  )}
                </form.Subscribe>
              )}

              {/* Advanced section */}
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
                    className="w-full font-bold text-black bg-mm-accent"
                  >
                    {isSubmitting ? i18n._(msg`library.saving`) : i18n._(msg`library.addLibrary`)}
                  </Button>
                )}
              </form.Subscribe>
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
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function LibrariesPage() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit' | null>(null);
  const [editLib, setEditLib] = useState<LibraryWithStats | null>(null);
  const [deleteLib, setDeleteLib] = useState<LibraryWithStats | null>(null);
  const [scanningId, setScanningId] = useState<string | null>(null);

  const { data: libraries = [], isLoading } = useQuery({
    queryKey: libraryKeys.list(),
    queryFn: libraryApi.list,
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
          size="md"
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
