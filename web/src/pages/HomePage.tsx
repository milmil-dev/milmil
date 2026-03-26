import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { PageTransition } from '../components/PageTransition';

export function HomePage() {
  return (
    <PageTransition>
      <div className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="text-center">
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="text-[11px] font-bold uppercase tracking-[0.3em] mb-3"
            style={{ color: 'oklch(65% 0.2 35)' }}
          >
            media server
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="text-5xl font-bold text-white mb-4 tracking-tight"
          >
            milmil
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="text-base mb-8"
            style={{ color: 'oklch(48% 0.01 280)' }}
          >
            Your self-hosted anime media server
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <motion.div whileTap={{ scale: 0.96 }}>
              <Link
                to="/libraries"
                className="inline-flex items-center justify-center rounded px-5 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-80"
                style={{ backgroundColor: 'oklch(65% 0.2 35)' }}
              >
                Manage Libraries
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
