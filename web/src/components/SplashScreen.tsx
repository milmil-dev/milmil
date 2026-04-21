import { motion } from 'motion/react';

export function SplashScreen() {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ backgroundColor: 'var(--mm-bg)' }}
    >
      {/* Logo with entrance animation */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <img src="/icons/icon-512.png" alt="milmil" className="w-16 h-16 mb-4" />
        <h1 className="text-2xl font-bold tracking-tight text-mm-accent">milmil</h1>
      </motion.div>

      {/* Thin sliding accent bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-8 h-[2px] w-24 overflow-hidden rounded-full bg-white/[0.06]"
      >
        <motion.div
          className="h-full rounded-full bg-mm-accent"
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
          style={{ width: '40%' }}
        />
      </motion.div>
    </div>
  );
}
