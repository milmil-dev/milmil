import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageTransition } from '../components/PageTransition';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { Switch } from '../components/ui/switch';
import {
  type CreateLibraryInput,
  type Library,
  libraryApi,
  libraryKeys,
  type UpdateLibraryInput,
} from '../lib/api/library';
import { animeGradient as cardGradient } from '../lib/gradient';
import { cn } from '../lib/utils';

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
      <form.Field
        name="name"
        validators={{ onChange: ({ value }) => (!value ? 'Name required' : undefined) }}
      >
        {(field) => (
          <div className="space-y-1.5">
            <Label
              htmlFor="lib-name"
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-mm-text-secondary"
            >
              Name
            </Label>
            <Input
              id="lib-name"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="Anime"
              className="bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
            />
            {field.state.meta.errors[0] && (
              <p className="text-xs text-red-400">{String(field.state.meta.errors[0])}</p>
            )}
          </div>
        )}
      </form.Field>

      <form.Field
        name="path"
        validators={{ onChange: ({ value }) => (!value ? 'Path required' : undefined) }}
      >
        {(field) => (
          <div className="space-y-1.5">
            <Label
              htmlFor="lib-path"
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-mm-text-secondary"
            >
              Path
            </Label>
            <Input
              id="lib-path"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="/mnt/media/anime"
              className="font-mono text-sm bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
            />
            {field.state.meta.errors[0] && (
              <p className="text-xs text-red-400">{String(field.state.meta.errors[0])}</p>
            )}
          </div>
        )}
      </form.Field>

      <form.Field name="scan_interval_minutes">
        {(field) => (
          <div className="space-y-1.5">
            <Label
              htmlFor="lib-interval"
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-mm-text-secondary"
            >
              Scan Interval (minutes)
            </Label>
            <Input
              id="lib-interval"
              type="number"
              value={field.state.value}
              onChange={(e) => field.handleChange(Number(e.target.value))}
              min={1}
              max={10080}
              className="bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
            />
          </div>
        )}
      </form.Field>

      <form.Field name="enabled">
        {(field) => (
          <div
            className="flex items-center justify-between py-3 border-t"
            style={{ borderColor: 'oklch(18% 0.01 280)' }}
          >
            <Label
              htmlFor="lib-enabled"
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-mm-text-secondary"
            >
              Enabled
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

        {/* Add / Edit sheet */}
        <Sheet
          open={drawerMode !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDrawerMode(null);
              setEditLib(null);
            }
          }}
        >
          <SheetContent
            side="right"
            className="w-[380px] border-l bg-mm-surface"
            style={{
              borderColor: 'oklch(18% 0.01 280)',
            }}
          >
            <SheetHeader>
              <SheetTitle className="text-white">
                {drawerMode === 'add' ? 'Add Library' : 'Edit Library'}
              </SheetTitle>
            </SheetHeader>

            {drawerMode === 'add' && (
              <LibraryForm
                defaultValues={{ name: '', path: '', enabled: true, scan_interval_minutes: 60 }}
                submitLabel="Add Library"
                onSubmit={async (values) => {
                  await createMutation.mutateAsync({
                    name: values.name,
                    path: values.path,
                    scan_interval_minutes: values.scan_interval_minutes,
                  });
                }}
              />
            )}

            {drawerMode === 'edit' && editLib && (
              <LibraryForm
                defaultValues={{
                  name: editLib.name,
                  path: editLib.path,
                  enabled: editLib.enabled === 1,
                  scan_interval_minutes: editLib.scan_interval_minutes,
                }}
                submitLabel="Save Changes"
                onSubmit={async (values) => {
                  await updateMutation.mutateAsync({ id: editLib.id, input: values });
                }}
              />
            )}
          </SheetContent>
        </Sheet>

        {/* Delete confirmation */}
        <AlertDialog open={!!deleteLib} onOpenChange={(open) => !open && setDeleteLib(null)}>
          <AlertDialogContent
            className="bg-mm-border-subtle"
            style={{
              borderColor: 'oklch(20% 0.01 280)',
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete &ldquo;{deleteLib?.name}&rdquo;?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-mm-text-secondary">
                All media file records will be removed. Your files on disk are unaffected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-[oklch(22%_0.01_280)] text-white hover:bg-[oklch(16%_0.01_280)]">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteLib && deleteMutation.mutate(deleteLib.id)}
                className="text-white"
                style={{ backgroundColor: 'oklch(45% 0.22 25)' }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  );
}
