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
            className="absolute inset-0 bg-[var(--mm-overlay)] backdrop-blur-[12px]"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className={cn(
              'relative z-10 w-full max-h-[85vh] rounded-t-2xl md:rounded-2xl overflow-hidden',
              'bg-[var(--mm-glass)] backdrop-blur-[48px] backdrop-saturate-[1.4]',
              'shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_0_0.5px_rgba(255,255,255,0.06)_inset]',
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
                <div className="sticky top-0 z-10 flex items-center justify-between px-8 py-5">
                  <h2 className="text-[15px] font-bold text-mm-text-primary">{title}</h2>
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
              <div className={cn('px-8 pb-8', !title && 'pt-6')}>{children}</div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
