// web/src/components/downloads/placeholder.ts
// Deterministic gradient pairs keyed by first char so the same title always gets the same colour
const GRADIENTS: [string, string][] = [
  ['#2a1b3d', '#1a2a3d'],
  ['#3d2a1b', '#2a3d1a'],
  ['#2a3d1b', '#1a3d2a'],
  ['#1b2a3d', '#2a1b3d'],
  ['#3d1b2a', '#3d2a1b'],
];

export function placeholderGradient(title: string): string {
  const code = title.charCodeAt(0) || 0;
  const [from, to] = GRADIENTS[code % GRADIENTS.length];
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}

export function placeholderLetter(title: string): string {
  const trimmed = title.trim();
  return trimmed ? Array.from(trimmed)[0]!.toUpperCase() : '?';
}
