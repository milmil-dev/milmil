import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { PageTransition } from '../components/PageTransition';
import { Button } from '../components/ui/button';
import { FormField } from '../components/ui/form-field';
import { Input } from '../components/ui/input';
import { type Download, downloadApi, downloadKeys } from '../lib/api/downloads';
import { cn } from '../lib/utils';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '--';
  return `${formatBytes(bytesPerSec)}/s`;
}

function progressPercent(dl: Download): number {
  if (dl.total_bytes === 0) return 0;
  return Math.min(100, (dl.completed_bytes / dl.total_bytes) * 100);
}

const statusColor: Record<string, string> = {
  active: 'bg-[oklch(32%_0.14_145)] text-[oklch(80%_0.12_145)]',
  waiting: 'bg-[oklch(28%_0.08_80)] text-[oklch(75%_0.08_80)]',
  paused: 'bg-[oklch(32%_0.12_80)] text-[oklch(80%_0.1_80)]',
  complete: 'bg-[oklch(30%_0.10_250)] text-[oklch(78%_0.10_250)]',
  error: 'bg-[oklch(30%_0.16_25)] text-[oklch(75%_0.16_25)]',
  removed: 'bg-[oklch(18%_0.01_280)] text-[oklch(42%_0.01_280)]',
};

// ── Download row ─────────────────────────────────────────────────────────────

function DownloadRow({
  dl,
  onPause,
  onResume,
  onDelete,
}: {
  dl: Download;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
}) {
  const pct = progressPercent(dl);
  const canPause = dl.status === 'active';
  const canResume = dl.status === 'paused';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="group rounded p-4 bg-mm-surface"
    >
      {/* Top row: name + status + actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate leading-snug">
            {dl.name || dl.url}
          </p>
          <p className="text-[11px] font-mono text-mm-text-tertiary truncate mt-0.5">{dl.url}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
              statusColor[dl.status] ?? statusColor.removed
            )}
          >
            {dl.status}
          </span>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canPause && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onPause}
                className="px-2 py-1 text-[11px] font-semibold rounded bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors"
              >
                Pause
              </motion.button>
            )}
            {canResume && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onResume}
                className="px-2 py-1 text-[11px] font-semibold rounded bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors"
              >
                Resume
              </motion.button>
            )}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={onDelete}
              className="px-2 py-1 text-[11px] font-semibold rounded text-red-300 border border-red-400/30 bg-red-900/20 hover:bg-red-900/40 transition-colors"
            >
              Delete
            </motion.button>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="mt-3 h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: 'oklch(16% 0.01 280)' }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{
            backgroundColor: dl.status === 'error' ? 'oklch(60% 0.2 25)' : 'oklch(70% 0.18 145)',
          }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 mt-2 text-[11px] text-mm-text-secondary">
        <span>{pct.toFixed(1)}%</span>
        <span>
          {formatBytes(dl.completed_bytes)} / {formatBytes(dl.total_bytes)}
        </span>
        {dl.status === 'active' && (
          <span className="text-mm-accent">{formatSpeed(dl.speed_bytes)}</span>
        )}
      </div>
    </motion.div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function DownloadsPage() {
  const queryClient = useQueryClient();

  const { data: downloads = [], isLoading } = useQuery({
    queryKey: downloadKeys.list(),
    queryFn: downloadApi.list,
    refetchInterval: 5000,
  });

  const addMutation = useMutation({
    mutationFn: (url: string) => downloadApi.add({ url }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: downloadKeys.list() });
      form.reset();
      toast.success('Download added');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pauseMutation = useMutation({
    mutationFn: (gid: string) => downloadApi.pause(gid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: downloadKeys.list() });
      toast.success('Download paused');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resumeMutation = useMutation({
    mutationFn: (gid: string) => downloadApi.resume(gid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: downloadKeys.list() });
      toast.success('Download resumed');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (gid: string) => downloadApi.delete(gid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: downloadKeys.list() });
      toast.success('Download removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const form = useForm({
    defaultValues: { url: '' },
    onSubmit: async ({ value }) => {
      const url = value.url.trim();
      if (!url) return;
      addMutation.mutate(url);
    },
  });

  const skeletonRows = [1, 2, 3];

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Header */}
        <div className="px-8 pt-12 pb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-mm-accent">milmil</p>
          <h1 className="text-3xl font-bold text-white mt-1 tracking-tight">Downloads</h1>
        </div>

        {/* Add download form */}
        <div className="px-8 pb-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
            className="flex gap-2 items-end"
          >
            <form.Field name="url">
              {(field) => (
                <FormField field={field} className="flex-1">
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Paste magnet link or URL..."
                    className="font-mono text-sm bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
                  />
                </FormField>
              )}
            </form.Field>

            <form.Subscribe selector={(s) => [s.isSubmitting, s.values.url] as const}>
              {([isSubmitting, url]) => (
                <Button
                  type="submit"
                  disabled={addMutation.isPending || isSubmitting || !url.trim()}
                  className="px-5 font-bold text-black bg-mm-accent shrink-0"
                >
                  {addMutation.isPending || isSubmitting ? 'Adding...' : 'Add Download'}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </div>

        {/* Download list */}
        <div className="px-8 pb-16 space-y-2">
          {isLoading ? (
            skeletonRows.map((i) => (
              <div key={i} className="rounded p-4 animate-pulse bg-mm-surface">
                <div
                  className="h-3 rounded mb-3"
                  style={{ backgroundColor: 'oklch(18% 0.01 280)', width: '40%' }}
                />
                <div
                  className="h-1.5 rounded-full"
                  style={{ backgroundColor: 'oklch(16% 0.01 280)' }}
                />
                <div
                  className="h-2 rounded mt-2"
                  style={{ backgroundColor: 'oklch(15% 0.01 280)', width: '25%' }}
                />
              </div>
            ))
          ) : downloads.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-mm-text-tertiary text-sm">No downloads yet.</p>
              <p className="text-mm-text-muted text-xs mt-1">
                Paste a magnet link or URL above to get started.
              </p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {downloads.map((dl) => (
                <DownloadRow
                  key={dl.id}
                  dl={dl}
                  onPause={() => pauseMutation.mutate(dl.gid)}
                  onResume={() => resumeMutation.mutate(dl.gid)}
                  onDelete={() => deleteMutation.mutate(dl.gid)}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
