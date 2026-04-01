import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      style={
        {
          '--normal-bg': 'rgba(12, 12, 12, 0.85)',
          '--normal-border': 'rgba(255, 255, 255, 0.08)',
          '--normal-text': '#ffffff',
          '--success-bg': 'rgba(12, 12, 12, 0.85)',
          '--success-border': 'rgba(74, 222, 128, 0.2)',
          '--success-text': '#4ade80',
          '--error-bg': 'rgba(12, 12, 12, 0.85)',
          '--error-border': 'rgba(248, 113, 113, 0.2)',
          '--error-text': '#f87171',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            'group toast !bg-[var(--normal-bg)] !border-[var(--normal-border)] !text-[var(--normal-text)] !shadow-[0_8px_32px_rgba(0,0,0,0.5)] !rounded-xl !backdrop-blur-xl !px-4 !py-3',
          title: '!text-[13px] !font-semibold !leading-tight',
          description: '!text-[11px] !text-white/40',
          actionButton: '!bg-mm-accent !text-black !font-semibold !rounded-md !text-xs',
          cancelButton: '!bg-white/[0.06] !text-white/50 !rounded-md !text-xs',
          success:
            '!border-[var(--success-border)] [&>[data-icon]]:!text-green-400',
          error:
            '!border-[var(--error-border)] [&>[data-icon]]:!text-red-400',
          info: '!border-white/[0.08] [&>[data-icon]]:!text-mm-accent',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
