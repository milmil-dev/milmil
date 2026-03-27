import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ open, onClose, title, children, className, size = 'md' }: ModalProps) {
  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0"
            style={{
              backgroundColor: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
            onClick={onClose}
          />

          {/* Panel — slides up on mobile, scales in on desktop */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className={cn(
              'relative z-10 w-full rounded-t-2xl md:rounded-2xl overflow-hidden',
              'max-h-[85vh] overflow-y-auto',
              sizeClasses[size],
              className
            )}
            style={{
              backgroundColor: 'oklch(10% 0.015 260 / 0.95)',
              backdropFilter: 'blur(24px) saturate(1.2)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
            }}
          >
            {/* Header */}
            {title && (
              <div
                className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
                style={{ backgroundColor: 'oklch(10% 0.015 260 / 0.8)' }}
              >
                <h2 className="text-[15px] font-bold text-white">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.1] transition-colors text-mm-text-secondary"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Content */}
            <div className={cn('px-5 pb-5', !title && 'pt-5')}>{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
