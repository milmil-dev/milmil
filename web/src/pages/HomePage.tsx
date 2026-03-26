export function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground mb-4">TanStack SPA Template</h1>
        <p className="text-lg text-muted-foreground mb-8">
          A modern React SPA with TanStack Router, Tailwind CSS v4, and PWA support.
        </p>
        <p className="text-sm text-muted-foreground">Version {__APP_VERSION__}</p>
      </div>
    </div>
  );
}
