export type AppPlatform = 'macos' | 'windows' | 'linux';

let cachedPlatform: AppPlatform | null = null;

function detectPlatform(): AppPlatform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('win')) return 'windows';
  return 'linux';
}

export function getPlatform(): AppPlatform {
  if (cachedPlatform === null) {
    cachedPlatform = detectPlatform();
  }
  return cachedPlatform;
}

export function usePlatform(): AppPlatform {
  return getPlatform();
}

export function useIsMacOS(): boolean {
  return usePlatform() === 'macos';
}

export function useIsWindows(): boolean {
  return usePlatform() === 'windows';
}

export function useIsLinux(): boolean {
  return usePlatform() === 'linux';
}
