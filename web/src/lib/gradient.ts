export function hashName(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h) ^ name.charCodeAt(i);
  }
  return Math.abs(h);
}

export function libraryGradient(name: string): string {
  const h = hashName(name);
  const h1 = h % 360;
  const h2 = (h1 + 55 + ((h >> 8) % 50)) % 360;
  return `linear-gradient(135deg, oklch(32% 0.18 ${h1}), oklch(16% 0.12 ${h2}))`;
}

export function animeGradient(name: string): string {
  const h = hashName(name);
  const h1 = h % 360;
  const h2 = (h1 + 55 + ((h >> 8) % 50)) % 360;
  const h3 = (h2 + 45 + ((h >> 16) % 40)) % 360;
  return `linear-gradient(150deg, oklch(40% 0.22 ${h1}) 0%, oklch(28% 0.26 ${h2}) 55%, oklch(18% 0.16 ${h3}) 100%)`;
}
