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
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="mb-4">
          <circle cx="32" cy="36" r="20" fill="#E88FAA"/>
          <polygon points="15,26 10,8 28,26" fill="#E88FAA"/>
          <polygon points="17,24 13,12 26,24" fill="#C97090"/>
          <polygon points="36,26 54,8 49,26" fill="#E88FAA"/>
          <polygon points="38,24 51,12 47,24" fill="#C97090"/>
          <ellipse cx="25" cy="33" rx="4" ry="5" fill="#070707"/>
          <ellipse cx="25" cy="33" rx="2" ry="4" fill="white" opacity="0.9"/>
          <ellipse cx="24" cy="31" rx="1" ry="1.5" fill="white"/>
          <ellipse cx="39" cy="32" rx="4" ry="5" fill="#070707"/>
          <ellipse cx="39" cy="32" rx="2" ry="4" fill="white" opacity="0.9"/>
          <ellipse cx="38" cy="30" rx="1" ry="1.5" fill="white"/>
          <polygon points="31,40 33,40 32,43" fill="#C97090"/>
          <path d="M28,45 Q32,48 36,45" stroke="#C97090" strokeWidth="1.2" fill="none"/>
        </svg>
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
