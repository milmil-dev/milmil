import { FolderLibraryIcon, Setting07Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { PageTransition } from '../components/PageTransition';
import { type Library, libraryApi, libraryKeys } from '../lib/api/library';
import { libraryGradient } from '../lib/gradient';

// ─── Time greeting ────────────────────────────────────────────────────────────
function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Late Night';
  if (h < 12) return 'Good Morning';
  if (h < 18) return 'Good Afternoon';
  return 'Good Evening';
}

// ─── Library tile ─────────────────────────────────────────────────────────────
function LibraryTile({ lib, index }: { lib: Library; index: number }) {
  const lastScanned = lib.last_scanned_at
    ? new Date(lib.last_scanned_at).toLocaleDateString()
    : 'Never scanned';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: 0.4 + index * 0.06,
        duration: 0.35,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      <Link
        to="/libraries"
        className="group block rounded-sm overflow-hidden"
        style={{ backgroundColor: 'oklch(10% 0.01 280)' }}
      >
        {/* Gradient strip */}
        <div
          className="h-1.5 transition-all duration-300 group-hover:h-2.5"
          style={{ background: libraryGradient(lib.name) }}
        />
        <div className="px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-white truncate">{lib.name}</p>
              <p
                className="text-[11px] font-mono truncate mt-1"
                style={{ color: 'oklch(38% 0.01 280)' }}
              >
                {lib.path}
              </p>
            </div>
            <span
              className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm mt-0.5"
              style={
                lib.enabled
                  ? { backgroundColor: 'oklch(22% 0.08 145)', color: 'oklch(72% 0.12 145)' }
                  : { backgroundColor: 'oklch(16% 0.01 280)', color: 'oklch(38% 0.01 280)' }
              }
            >
              {lib.enabled ? 'Active' : 'Off'}
            </span>
          </div>
          <p className="text-[10px] mt-3" style={{ color: 'oklch(30% 0.01 280)' }}>
            {lastScanned}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyLibraries() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.4 }}
    >
      <Link
        to="/libraries"
        className="group block rounded-sm border border-dashed py-10 px-6 text-center transition-colors hover:border-[oklch(65%_0.2_35)]/30"
        style={{ borderColor: 'oklch(18% 0.01 280)' }}
      >
        <div
          className="mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-4 transition-colors group-hover:bg-[oklch(65%_0.2_35)]/10"
          style={{ backgroundColor: 'oklch(12% 0.01 280)' }}
        >
          <HugeiconsIcon
            icon={FolderLibraryIcon}
            size={18}
            className="transition-colors group-hover:text-[oklch(65%_0.2_35)]"
            style={{ color: 'oklch(32% 0.01 280)' }}
          />
        </div>
        <p className="text-sm font-medium text-white mb-1">No libraries yet</p>
        <p className="text-[12px]" style={{ color: 'oklch(38% 0.01 280)' }}>
          Add a folder to start scanning your anime collection
        </p>
      </Link>
    </motion.div>
  );
}

// ─── Quick action link ────────────────────────────────────────────────────────
function QuickAction({
  to,
  icon,
  label,
  sub,
  delay,
}: {
  to: string;
  icon: typeof FolderLibraryIcon;
  label: string;
  sub: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <Link to={to} className="group flex items-center gap-3 py-2 transition-colors">
        <div
          className="shrink-0 w-8 h-8 rounded-sm flex items-center justify-center transition-colors group-hover:bg-[oklch(14%_0.02_280)]"
          style={{ backgroundColor: 'oklch(11% 0.01 280)' }}
        >
          <HugeiconsIcon
            icon={icon}
            size={15}
            className="transition-colors group-hover:text-[oklch(65%_0.2_35)]"
            style={{ color: 'oklch(40% 0.01 280)' }}
          />
        </div>
        <div>
          <p className="text-[13px] font-medium text-white leading-tight">{label}</p>
          <p className="text-[11px]" style={{ color: 'oklch(32% 0.01 280)' }}>
            {sub}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function HomePage() {
  const { data: libraries = [] } = useQuery({
    queryKey: libraryKeys.list(),
    queryFn: libraryApi.list,
  });

  const activeCount = libraries.filter((l) => l.enabled).length;

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* ── Hero ──────────────────────────────────────────────── */}
        <div className="relative overflow-hidden">
          {/* Ambient gradient backdrop */}
          <div
            className="absolute inset-0 opacity-40"
            style={{
              background:
                'radial-gradient(ellipse 70% 50% at 20% 40%, oklch(25% 0.14 35), transparent), radial-gradient(ellipse 50% 40% at 80% 60%, oklch(18% 0.10 280), transparent)',
            }}
          />

          <div className="relative px-8 pt-14 pb-10">
            {/* Greeting */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="text-[11px] uppercase tracking-[0.35em] font-medium"
              style={{ color: 'oklch(40% 0.01 280)' }}
            >
              {greeting()}
            </motion.p>

            {/* Title block */}
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="mt-3 text-[clamp(2rem,4vw,2.8rem)] font-bold text-white tracking-tight leading-[1.1]"
            >
              milmil
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.18, duration: 0.4 }}
              className="mt-2 text-[14px] max-w-md"
              style={{ color: 'oklch(42% 0.01 280)' }}
            >
              {libraries.length > 0
                ? `${libraries.length} ${libraries.length === 1 ? 'library' : 'libraries'} configured \u00b7 ${activeCount} active`
                : 'Your self-hosted anime media server'}
            </motion.p>

            {/* Decorative rule */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.3, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="mt-6 h-px w-full origin-left"
              style={{ backgroundColor: 'oklch(14% 0.01 280)' }}
            />
          </div>
        </div>

        {/* ── Content ───────────────────────────────────────────── */}
        <div className="px-8 pb-16">
          <div className="grid gap-10" style={{ gridTemplateColumns: 'minmax(0, 1fr) 200px' }}>
            {/* Left: Libraries */}
            <div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.32 }}
                className="flex items-baseline justify-between mb-4"
              >
                <h2
                  className="text-[10px] font-bold uppercase tracking-[0.25em]"
                  style={{ color: 'oklch(35% 0.01 280)' }}
                >
                  Libraries
                </h2>
                {libraries.length > 0 && (
                  <Link
                    to="/libraries"
                    className="text-[11px] font-medium transition-colors hover:text-white"
                    style={{ color: 'oklch(45% 0.01 280)' }}
                  >
                    View all
                  </Link>
                )}
              </motion.div>

              {libraries.length === 0 ? (
                <EmptyLibraries />
              ) : (
                <div className="grid gap-2">
                  {libraries.slice(0, 6).map((lib, i) => (
                    <LibraryTile key={lib.id} lib={lib} index={i} />
                  ))}
                </div>
              )}
            </div>

            {/* Right: Quick actions */}
            <div>
              <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 }}
                className="text-[10px] font-bold uppercase tracking-[0.25em] mb-4"
                style={{ color: 'oklch(35% 0.01 280)' }}
              >
                Quick Actions
              </motion.h2>

              <div className="space-y-1">
                <QuickAction
                  to="/libraries"
                  icon={FolderLibraryIcon}
                  label="Libraries"
                  sub="Manage folders"
                  delay={0.42}
                />
                <QuickAction
                  to="/settings"
                  icon={Setting07Icon}
                  label="Settings"
                  sub="Configure server"
                  delay={0.48}
                />
              </div>

              {/* Version */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-8 text-[10px] font-mono"
                style={{ color: 'oklch(22% 0.01 280)' }}
              >
                v{__APP_VERSION__}
              </motion.p>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
