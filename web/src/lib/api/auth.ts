import { api } from '../api-client';
import type { User } from '../../store/auth-store';

export interface AvatarResponse {
  avatar_url: string | null;
}

/** Largest edge the browser downscales an avatar to before uploading. */
export const AVATAR_MAX_EDGE = 1024;
/** Server limit for the uploaded file. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const authApi = {
  me: () => api.get<User>('/api/v1/auth/me'),
  uploadAvatar: (file: Blob, filename = 'avatar.jpg') => {
    const form = new FormData();
    form.append('file', file, filename);
    return api.putForm<AvatarResponse>('/api/v1/auth/me/avatar', form);
  },
  setAvatarFromUrl: (sourceUrl: string) =>
    api.put<AvatarResponse>('/api/v1/auth/me/avatar', { source_url: sourceUrl }),
  deleteAvatar: () => api.delete<void>('/api/v1/auth/me/avatar'),
};

export const authKeys = {
  me: () => ['auth', 'me'] as const,
};

/**
 * Downscale to ≤ `AVATAR_MAX_EDGE` and re-encode as JPEG so a phone photo
 * does not hit the 2 MB limit. Falls back to the original when the canvas
 * pipeline is unavailable (tests, exotic formats).
 */
export async function prepareAvatarUpload(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, AVATAR_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= AVATAR_MAX_BYTES) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9)
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
