import { useQuery } from '@tanstack/react-query';
import { systemApi } from '../lib/api/system';
import { api } from '../lib/api-client';
import { useUpdateStore } from '../store/update-store';

// Minimal semver-greater-than. Compares major.minor.patch numerically;
// a version with a pre-release suffix (e.g. "0.1.8-dev") is treated as
// LESS than its release (e.g. "0.1.8"). Sufficient for "is upstream
// newer than us"; not a full semver implementation.
export function semverGt(a: string, b: string): boolean {
  const [aMain = '', aPre = ''] = a.split('-', 2);
  const [bMain = '', bPre = ''] = b.split('-', 2);
  const aParts = aMain.split('.').map((p) => parseInt(p, 10) || 0);
  const bParts = bMain.split('.').map((p) => parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const av = aParts[i] ?? 0;
    const bv = bParts[i] ?? 0;
    if (av !== bv) return av > bv;
  }
  // numerics equal — release > prerelease, prerelease < release
  if (aPre === '' && bPre !== '') return true;
  if (aPre !== '' && bPre === '') return false;
  return aPre > bPre;
}

export function useUpdateCheck() {
  const latest = useUpdateStore((s) => s.latest);
  const releaseUrl = useUpdateStore((s) => s.releaseUrl);
  const publishedAt = useUpdateStore((s) => s.publishedAt);
  const dismissedVersion = useUpdateStore((s) => s.dismissedVersion);
  const setLatest = useUpdateStore((s) => s.setLatest);
  const dismiss = useUpdateStore((s) => s.dismiss);

  // Reuse AboutPanel's queryKey so /system/info is fetched once, not twice.
  const { data: info } = useQuery({
    queryKey: ['system-info'],
    queryFn: () => api.get<{ version: string }>('/api/v1/system/info'),
    staleTime: Infinity,
  });

  useQuery({
    queryKey: ['system', 'update-check'],
    queryFn: async () => {
      const res = await systemApi.updateCheck();
      if (res.latest) {
        setLatest({
          latest: res.latest,
          releaseUrl: res.release_url ?? null,
          publishedAt: res.published_at ?? null,
        });
      }
      return res;
    },
    staleTime: Infinity,
  });

  const current = info?.version ?? null;
  const hasUpdate = !!latest && !!current && semverGt(latest, current);
  const showBadge = hasUpdate && latest !== dismissedVersion;
  return { current, latest, releaseUrl, publishedAt, hasUpdate, showBadge, dismiss };
}
