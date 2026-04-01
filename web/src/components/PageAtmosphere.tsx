import { cn } from '../lib/utils';

/**
 * PageAtmosphere — cinematic background wash for content pages.
 *
 * Each page gets a diagonal gradient wash (like an anime title-card background)
 * plus a film-grain overlay for texture. The wash angle and hue shift give each
 * page a unique feel while staying in the moe-pink family.
 *
 * Presets:
 *   search   — top-right sweep, warm pink
 *   schedule — left-to-right, rose-gold
 *   collection — bottom-left bloom, deep pink
 *   libraries  — center-top, cool violet-pink
 *   detail     — top-left, soft warm
 *   settings   — centered, barely-there neutral
 */

type Preset = 'search' | 'schedule' | 'collection' | 'libraries' | 'detail' | 'settings';

const presets: Record<Preset, { gradient: string; grain: number }> = {
  search: {
    gradient: [
      'radial-gradient(ellipse 80% 60% at 85% 5%, oklch(0.55 0.16 350 / 0.14), transparent 70%)',
      'radial-gradient(ellipse 60% 50% at 10% 20%, oklch(0.45 0.1 300 / 0.08), transparent 65%)',
      'linear-gradient(135deg, transparent 30%, oklch(0.5 0.12 345 / 0.04) 60%, transparent 85%)',
    ].join(', '),
    grain: 0.03,
  },
  schedule: {
    gradient: [
      'radial-gradient(ellipse 70% 55% at 20% 8%, oklch(0.52 0.14 355 / 0.12), transparent 65%)',
      'radial-gradient(ellipse 55% 45% at 80% 15%, oklch(0.48 0.1 310 / 0.08), transparent 60%)',
      'linear-gradient(160deg, oklch(0.5 0.1 350 / 0.03) 0%, transparent 45%, oklch(0.45 0.08 300 / 0.03) 100%)',
    ].join(', '),
    grain: 0.025,
  },
  collection: {
    gradient: [
      'radial-gradient(ellipse 75% 60% at 5% 30%, oklch(0.5 0.15 348 / 0.13), transparent 65%)',
      'radial-gradient(ellipse 50% 40% at 90% 10%, oklch(0.45 0.1 305 / 0.07), transparent 60%)',
      'linear-gradient(195deg, oklch(0.48 0.12 350 / 0.05) 0%, transparent 50%)',
    ].join(', '),
    grain: 0.03,
  },
  libraries: {
    gradient: [
      'radial-gradient(ellipse 65% 50% at 50% 0%, oklch(0.48 0.12 295 / 0.12), transparent 65%)',
      'radial-gradient(ellipse 55% 45% at 85% 25%, oklch(0.52 0.13 350 / 0.08), transparent 60%)',
      'linear-gradient(170deg, oklch(0.45 0.09 290 / 0.04) 0%, transparent 40%, oklch(0.5 0.1 350 / 0.03) 100%)',
    ].join(', '),
    grain: 0.025,
  },
  detail: {
    gradient: [
      'radial-gradient(ellipse 70% 55% at 25% 5%, oklch(0.52 0.14 350 / 0.12), transparent 65%)',
      'radial-gradient(ellipse 50% 40% at 80% 20%, oklch(0.45 0.09 295 / 0.07), transparent 55%)',
    ].join(', '),
    grain: 0.02,
  },
  settings: {
    gradient: [
      'radial-gradient(ellipse 60% 45% at 50% 8%, oklch(0.5 0.1 350 / 0.08), transparent 60%)',
      'radial-gradient(ellipse 40% 35% at 75% 20%, oklch(0.45 0.07 300 / 0.05), transparent 55%)',
    ].join(', '),
    grain: 0.02,
  },
};

export function PageAtmosphere({ preset, className }: { preset: Preset; className?: string }) {
  const p = presets[preset];
  return (
    <div
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      aria-hidden="true"
    >
      {/* Diagonal gradient wash */}
      <div
        className="absolute inset-0"
        style={{ backgroundImage: p.gradient }}
      />
      {/* Film grain overlay — gives depth, prevents flat digital look */}
      <div
        className="absolute inset-0 mix-blend-soft-light"
        style={{
          opacity: p.grain,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
        }}
      />
      {/* Subtle vignette — darkens edges, focuses attention center */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 80% 70% at 50% 30%, transparent 50%, oklch(0.07 0.005 285 / 0.4) 100%)',
        }}
      />
    </div>
  );
}
