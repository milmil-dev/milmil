import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '../components/Modal';
import { PageTransition } from '../components/PageTransition';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import {
  type CreateLibraryInput,
  type Library,
  type TestConnectionInput,
  type UpdateLibraryInput,
  libraryApi,
  libraryKeys,
} from '../lib/api/library';
import { animeGradient as cardGradient } from '../lib/gradient';
import { cn } from '../lib/utils';

type SourceType = 'local' | 'smb' | 'sftp';

// ─── Source type badge ────────────────────────────────────────────────────────
function SourceBadge({ sourceType }: { sourceType: string }) {
  if (!sourceType || sourceType === 'local') return null;
  const label = sourceType.toUpperCase();
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/[0.12] text-gray-200">
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
  lib: Library;
  scanning: boolean;
  onScan: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const lastScanned = lib.last_scanned_at
    ? new Date(lib.last_scanned_at).toLocaleDateString()
    : 'Never';

  return (
    <div className="group relative rounded overflow-hidden cursor-pointer focus-within:ring-2 focus-within:ring-[oklch(65%_0.2_35)]">
      {/* Poster area */}
      <div className="relative h-44 overflow-hidden" style={{ background: cardGradient(lib.name) }}>
        {/* Scanner sweep animation */}
        <AnimatePresence>
          {scanning && (
            <motion.div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)',
              }}
              initial={{ x: '-100%' }}
              animate={{ x: '200%' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
            />
          )}
        </AnimatePresence>

        {/* Scanning badge */}
        {scanning && (
          <div className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-mm-accent text-black">
            SCANNING
          </div>
        )}

        {/* Hover action overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ backgroundColor: 'rgba(0,0,0,0.62)' }}
        >
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={onScan}
            disabled={scanning}
            className="px-3 py-1.5 text-xs font-semibold rounded bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors disabled:opacity-40"
          >
            {scanning ? 'Scanning\u2026' : 'Scan'}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={onEdit}
            className="px-3 py-1.5 text-xs font-semibold rounded bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors"
          >
            Edit
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={onDelete}
            className="px-3 py-1.5 text-xs font-semibold rounded text-red-300 border border-red-400/30 bg-red-900/20 hover:bg-red-900/40 transition-colors"
          >
            Delete
          </motion.button>
        </div>
      </div>

      {/* Info area */}
      <div className="p-3 bg-mm-surface">
        <p className="font-semibold text-sm text-white truncate leading-snug">{lib.name}</p>
        <p className="text-[11px] font-mono truncate mt-0.5 text-mm-text-secondary">{lib.path}</p>
        <div className="flex items-center gap-2 mt-2">
          <span
            className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded',
              lib.enabled
                ? 'bg-[oklch(32%_0.14_145)] text-[oklch(80%_0.12_145)]'
                : 'bg-[oklch(18%_0.01_280)] text-[oklch(42%_0.01_280)]'
            )}
          >
            {lib.enabled ? 'ON' : 'OFF'}
          </span>
          <SourceBadge sourceType={lib.source_type} />
          <span className="text-[10px] text-mm-text-tertiary">{lastScanned}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Add card ─────────────────────────────────────────────────────────────────
function AddCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded overflow-hidden border border-dashed transition-colors w-full focus-visible:ring-2 focus-visible:ring-[oklch(65%_0.2_35)] focus-visible:outline-none"
      style={{ borderColor: 'oklch(22% 0.01 280)' }}
    >
      <div className="h-44 flex items-center justify-center transition-colors bg-mm-sidebar">
        <div
          className="w-11 h-11 rounded-full border flex items-center justify-center transition-colors group-hover:border-[oklch(65%_0.2_35)]"
          style={{ borderColor: 'oklch(25% 0.01 280)' }}
        >
          <span className="text-xl leading-none transition-colors group-hover:text-[oklch(65%_0.2_35)] text-mm-text-muted">
            +
          </span>
        </div>
      </div>
      <div className="p-3 bg-mm-surface">
        <p className="text-sm font-semibold transition-colors group-hover:text-white text-mm-text-tertiary">
          Add Library
        </p>
        <p className="text-[11px] mt-0.5 text-mm-text-muted">Connect a media folder</p>
      </div>
    </button>
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
  'bg-white/[0.06] border-none focus:ring-1 focus:ring-[oklch(65%_0.2_35)] text-white rounded-md';

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
        validators={{ onChange: ({ value }) => (!value ? 'Name required' : undefined) }}
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
                      placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
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
                      placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
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
        validators={{ onChange: ({ value }) => (!value ? 'Path required' : undefined) }}
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
          <div
            className="flex items-center justify-between py-3 border-t"
            style={{ borderColor: 'oklch(18% 0.01 280)' }}
          >
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
            {isSubmitting ? 'Saving\u2026' : submitLabel}
          </Button>
        )}
      </form.Subscribe>
    </form>
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
  const queryClient = useQueryClient();
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit' | null>(null);
  const [editLib, setEditLib] = useState<Library | null>(null);
  const [deleteLib, setDeleteLib] = useState<Library | null>(null);
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
      toast.success('Library added');
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
      toast.success('Library updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => libraryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.list() });
      setDeleteLib(null);
      toast.success('Library deleted');
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
      toast.success('Scan complete');
    },
    onError: (err: Error) => {
      setScanningId(null);
      toast.error(`Scan failed: ${err.message}`);
    },
  });

  const skeletonCards = [1, 2, 3, 4];

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Header */}
        <div className="px-8 pt-12 pb-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-mm-accent">
                milmil
              </p>
              <h1 className="text-3xl font-bold text-white mt-1 tracking-tight">My Libraries</h1>
            </div>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => setDrawerMode('add')}
              className="px-4 py-2 text-sm font-bold rounded transition-opacity hover:opacity-80 text-black bg-mm-accent"
            >
              + Add Library
            </motion.button>
          </div>
        </div>

        {/* Grid */}
        <div className="px-8 pb-16">
          {isLoading ? (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
            >
              {skeletonCards.map((i) => (
                <div key={i} className="rounded overflow-hidden animate-pulse">
                  <div className="h-44 bg-mm-border" />
                  <div className="p-3 bg-mm-surface">
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
          ) : (
            <motion.div
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
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
                    whileHover={{ scale: 1.03 }}
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

        {/* Add / Edit modal */}
        <Modal
          open={drawerMode !== null}
          onClose={() => {
            setDrawerMode(null);
            setEditLib(null);
          }}
          title={drawerMode === 'add' ? 'Add Library' : 'Edit Library'}
          size="sm"
        >
          {drawerMode === 'add' && (
            <LibraryForm
              defaultValues={formDefaultValues()}
              submitLabel="Add Library"
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
          )}

          {drawerMode === 'edit' && editLib && (
            <LibraryForm
              defaultValues={formDefaultValues(editLib)}
              submitLabel="Save Changes"
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
          title={`Delete "${deleteLib?.name}"?`}
          size="sm"
        >
          <p className="text-[13px] text-mm-text-secondary mb-5">
            All media file records will be removed. Your files on disk are unaffected.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteLib(null)}
              className="px-4 py-2 text-[13px] font-medium rounded-md bg-white/[0.06] text-white hover:bg-white/[0.1] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (deleteLib) deleteMutation.mutate(deleteLib.id);
              }}
              className="px-4 py-2 text-[13px] font-medium rounded-md text-white transition-colors"
              style={{ backgroundColor: 'oklch(45% 0.22 25)' }}
            >
              Delete
            </button>
          </div>
        </Modal>
      </div>
    </PageTransition>
  );
}
