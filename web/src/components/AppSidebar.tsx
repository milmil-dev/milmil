import { FolderLibraryIcon, HouseIcon, Setting07Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Link, useRouterState } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

const navItems = [
  { to: '/', label: 'Home', icon: HouseIcon },
  { to: '/libraries', label: 'Libraries', icon: FolderLibraryIcon },
  { to: '/settings', label: 'Settings', icon: Setting07Icon },
] as const;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring' as const, stiffness: 380, damping: 28 },
  },
};

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <motion.aside
      initial={{ x: -240, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      className="fixed left-0 top-0 bottom-0 w-[240px] z-40 flex flex-col border-r"
      style={{
        backgroundColor: 'oklch(9% 0.01 280)',
        borderColor: 'oklch(14% 0.01 280)',
      }}
    >
      {/* Logo */}
      <div className="px-6 py-7 shrink-0">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <p className="text-xl font-bold tracking-tight" style={{ color: 'oklch(65% 0.2 35)' }}>
            milmil
          </p>
          <p
            className="text-[10px] uppercase tracking-[0.25em] mt-0.5"
            style={{ color: 'oklch(35% 0.01 280)' }}
          >
            media server
          </p>
        </motion.div>
      </div>

      {/* Nav */}
      <motion.nav
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex-1 px-3 space-y-0.5"
      >
        {navItems.map(({ to, label, icon }) => {
          const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to);
          return (
            <motion.div key={to} variants={itemVariants}>
              <motion.div
                whileHover={{ x: 3 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              >
                <Link
                  to={to}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors relative',
                    isActive
                      ? 'text-white'
                      : 'text-[oklch(45%_0.01_280)] hover:text-[oklch(70%_0.01_280)] hover:bg-[oklch(13%_0.01_280)]'
                  )}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="activeIndicator"
                      className="absolute inset-0 rounded"
                      style={{ backgroundColor: 'oklch(14% 0.02 280)' }}
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="activeBar"
                      className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full"
                      style={{ backgroundColor: 'oklch(65% 0.2 35)' }}
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10 opacity-80">
                    <HugeiconsIcon icon={icon} size={18} />
                  </span>
                  <span className="relative z-10">{label}</span>
                </Link>
              </motion.div>
            </motion.div>
          );
        })}
      </motion.nav>

      {/* Bottom section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="px-5 py-5 border-t"
        style={{ borderColor: 'oklch(14% 0.01 280)' }}
      >
        <p className="text-[10px]" style={{ color: 'oklch(28% 0.01 280)' }}>
          v{__APP_VERSION__}
        </p>
      </motion.div>
    </motion.aside>
  );
}
