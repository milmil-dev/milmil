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
  size?: 'sm' | 'md' | 'lg' | 'xl';
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
  // Lock body scroll when open — compensate for scrollbar width to prevent layout shift
  useEffect(() => {
    if (open) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
      return () => {
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
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
    xl: 'max-w-5xl',
  };

  return createPortal(
    <AnimatePresence mode="wait">
      {open && (
        <motion.div
          key="modal-wrapper"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
        >
          {/* Backdrop — HeroUI-style opaque gradient */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className={cn(
              'relative z-10 w-full max-h-[85vh] rounded-t-2xl md:rounded-2xl overflow-hidden',
              'bg-[var(--mm-bg-elevated)] border border-white/[0.06]',
              'shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]',
              sizeClasses[size],
              className
            )}
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
            <div className="relative z-[1] overflow-y-auto max-h-[85vh]" onScroll={onScroll}>
              {/* Header */}
              {title && (
                <div className="flex items-center justify-between px-6 pt-6 pb-2">
                  <h2 className="text-base font-semibold text-white">{title}</h2>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-7 h-7 rounded-full flex items-center justify-center bg-white/[0.05] hover:bg-white/[0.1] transition-colors text-white/40 hover:text-white/60 cursor-pointer"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Body */}
              <div className={cn('px-6 pb-6', !title && 'pt-6', title && 'pt-2')}>{children}</div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
