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
  /** Fixed background element that stays in place while content scrolls */
  fixedBg?: React.ReactNode;
  /** Scroll handler for the scrollable content area */
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  size = 'md',
  fixedBg,
  onScroll,
}: ModalProps) {
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
    lg: 'max-w-3xl',
  };

  return createPortal(
    <AnimatePresence mode="wait">
      {open && (
        <motion.div
          key="modal-wrapper"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
        >
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

          {/* Panel — slides up on open, slides down on close */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className={cn(
              'relative z-10 w-full rounded-t-2xl md:rounded-2xl overflow-hidden',
              'max-h-[80vh]',
              sizeClasses[size],
              className
            )}
            style={{
              backgroundColor: 'oklch(12% 0.01 260 / 0.72)',
              backdropFilter: 'blur(40px) saturate(1.5)',
              WebkitBackdropFilter: 'blur(40px) saturate(1.5)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.05) inset',
            }}
          >
            {/* Fixed background — covers top portion only, fades at bottom edge */}
            {fixedBg && (
              <div
                className="absolute inset-x-0 top-0 z-0 pointer-events-none overflow-hidden h-[420px]"
                style={{
                  maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                  WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                }}
              >
                {fixedBg}
              </div>
            )}

            {/* Scrollable area */}
            <div className="relative z-[1] max-h-[80vh] overflow-y-auto" onScroll={onScroll}>
              {/* Header */}
              {title && (
                <div
                  className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
                  style={{
                    backgroundColor: 'oklch(12% 0.01 260 / 0.5)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                  }}
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
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
