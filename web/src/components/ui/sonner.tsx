import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTheme } from '@/lib/theme-context';

function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--mm-glass)',
          '--normal-text': 'var(--mm-text-primary)',
          '--success-bg': 'var(--mm-glass)',
          '--success-text': '#4ade80',
          '--error-bg': 'var(--mm-glass)',
          '--error-text': '#f87171',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            'group toast !bg-[var(--normal-bg)] !border-none !text-[var(--normal-text)] !shadow-[0_8px_32px_rgba(0,0,0,0.5)] !rounded-xl !backdrop-blur-xl !px-4 !py-3',
          title: '!text-[13px] !font-semibold !leading-tight',
          description: '!text-[11px] !text-ink/40',
          actionButton: '!bg-mm-accent !text-ink-contrast !font-semibold !rounded-md !text-xs',
          cancelButton: '!bg-ink/[0.06] !text-ink/50 !rounded-md !text-xs',
          success: '[&>[data-icon]]:!text-green-400',
          error: '[&>[data-icon]]:!text-red-400',
          info: '[&>[data-icon]]:!text-mm-accent',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
