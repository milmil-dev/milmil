import { useState } from 'react';
import { apiUrl } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  user: { username?: string | null; avatar_url?: string | null } | null | undefined;
  /** Pixel size of the circle. */
  size?: number;
  className?: string;
}

/**
 * The user's picture when one is set, else the initial-letter circle the
 * sidebar always had. A broken image (deleted file, offline) falls back too.
 */
export function UserAvatar({ user, size = 36, className }: UserAvatarProps) {
  const [broken, setBroken] = useState(false);
  const url = user?.avatar_url && !broken ? apiUrl(user.avatar_url) : null;
  const initial = user?.username?.charAt(0)?.toUpperCase() ?? '?';
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) };

  if (url) {
    return (
      <img
        src={url}
        alt={user?.username ?? ''}
        width={size}
        height={size}
        style={style}
        onError={() => setBroken(true)}
        className={cn('rounded-full object-cover shrink-0 bg-ink/[0.08]', className)}
        data-testid="user-avatar-image"
      />
    );
  }
  return (
    <div
      style={style}
      aria-hidden="true"
      data-testid="user-avatar-initial"
      className={cn(
        'flex items-center justify-center rounded-full bg-ink/[0.08] text-ink/60 font-bold shrink-0',
        className
      )}
    >
      {initial}
    </div>
  );
}
