import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast bg-mm-surface border-white/[0.08] text-white shadow-lg rounded-lg',
          title: 'text-sm font-medium',
          description: 'text-xs text-white/50',
          actionButton: 'bg-mm-accent text-black font-medium',
          cancelButton: 'bg-white/[0.06] text-white/60',
          success: 'border-green-500/20',
          error: 'border-red-500/20',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
