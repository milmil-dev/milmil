import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/UserAvatar';
import { AVATAR_MAX_BYTES, authApi, authKeys, prepareAvatarUpload } from '@/lib/api/auth';
import { type CollectionAnime, collectionApi, collectionKeys } from '@/lib/api/collection';
import { type AnimeCharacter, discoverApi, discoverKeys } from '@/lib/api/discover';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';

/**
 * Profile card with the avatar: upload a picture (downscaled in the browser),
 * pick a character from a series in the collection, or remove it. The store's
 * user is refreshed from /auth/me after every change so the sidebar follows.
 */
export function AvatarCard() {
  const { i18n } = useLingui();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function refreshUser() {
    const me = await authApi.me();
    setUser(me);
    await queryClient.invalidateQueries({ queryKey: authKeys.me() });
  }

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const blob = await prepareAvatarUpload(file);
      if (blob.size > AVATAR_MAX_BYTES) throw new Error('too-large');
      return authApi.uploadAvatar(blob, blob.type === 'image/jpeg' ? 'avatar.jpg' : file.name);
    },
    onSuccess: async () => {
      await refreshUser();
      toast.success(i18n._(msg`account.avatar.updated`));
    },
    onError: (err) =>
      toast.error(
        err instanceof Error && err.message === 'too-large'
          ? i18n._(msg`account.avatar.tooLarge`)
          : i18n._(msg`account.avatar.updateFailed`)
      ),
  });

  const fromUrl = useMutation({
    mutationFn: (sourceUrl: string) => authApi.setAvatarFromUrl(sourceUrl),
    onSuccess: async () => {
      setPickerOpen(false);
      await refreshUser();
      toast.success(i18n._(msg`account.avatar.updated`));
    },
    onError: () => toast.error(i18n._(msg`account.avatar.updateFailed`)),
  });

  const remove = useMutation({
    mutationFn: () => authApi.deleteAvatar(),
    onSuccess: async () => {
      await refreshUser();
      toast.success(i18n._(msg`account.avatar.removed`));
    },
    onError: () => toast.error(i18n._(msg`account.avatar.updateFailed`)),
  });

  const busy = upload.isPending || fromUrl.isPending || remove.isPending;

  return (
    <SettingsCard label={i18n._(msg`account.profile`)}>
      <div className="flex items-center gap-4">
        <div className="relative">
          <UserAvatar user={user} size={64} className="ring-1 ring-ink/[0.08]" />
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-mm-bg/60">
              <Spinner className="size-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink truncate">{user?.username ?? '—'}</p>
          <p className="text-xs text-ink/30">ID: {user?.id ?? '—'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              data-testid="avatar-change"
              onClick={() => fileInput.current?.click()}
            >
              {i18n._(msg`account.avatar.change`)}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              data-testid="avatar-use-character"
              onClick={() => setPickerOpen(true)}
            >
              {i18n._(msg`account.avatar.useCharacter`)}
            </Button>
            {user?.avatar_url && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                data-testid="avatar-remove"
                onClick={() => remove.mutate()}
              >
                {i18n._(msg`account.avatar.remove`)}
              </Button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-ink/30">{i18n._(msg`account.avatar.hint`)}</p>
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        data-testid="avatar-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) upload.mutate(file);
        }}
      />
      <CharacterPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(url) => fromUrl.mutate(url)}
        busy={fromUrl.isPending}
      />
    </SettingsCard>
  );
}

interface CharacterPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (imageUrl: string) => void;
  busy: boolean;
}

/** Series from the collection first, then that series' characters with art. */
function CharacterPickerDialog({ open, onOpenChange, onPick, busy }: CharacterPickerDialogProps) {
  const { i18n } = useLingui();
  const [series, setSeries] = useState<CollectionAnime | null>(null);

  const collection = useQuery({
    queryKey: collectionKeys.list(),
    queryFn: () => collectionApi.list(),
    enabled: open,
  });
  const bangumiId = series?.bangumi_id ?? null;
  const detail = useQuery({
    queryKey: discoverKeys.detail(bangumiId ?? 0),
    queryFn: () => discoverApi.detail(bangumiId as number),
    enabled: open && bangumiId !== null,
  });
  const characters = (detail.data?.characters ?? []).filter(
    (c): c is AnimeCharacter & { character: { image: string } } => !!c.character.image
  );
  const withIds = (collection.data ?? []).filter((a) => a.bangumi_id !== null);

  function close(next: boolean) {
    if (!next) setSeries(null);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {series ? (series.title_zh ?? series.title) : i18n._(msg`account.avatar.pickSeries`)}
          </DialogTitle>
          <DialogDescription>
            {series
              ? i18n._(msg`account.avatar.pickCharacter`)
              : i18n._(msg`account.avatar.pickSeriesHint`)}
          </DialogDescription>
        </DialogHeader>
        {series ? (
          <div className="space-y-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setSeries(null)}>
              ← {i18n._(msg`account.avatar.back`)}
            </Button>
            {detail.isPending ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : characters.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink/40">
                {i18n._(msg`account.avatar.noCharacters`)}
              </p>
            ) : (
              <div className="grid max-h-[50vh] grid-cols-4 gap-3 overflow-y-auto sm:grid-cols-5">
                {characters.map((c) => (
                  <button
                    key={c.character.id}
                    type="button"
                    disabled={busy}
                    onClick={() => onPick(c.character.image)}
                    className={cn(
                      'group flex flex-col items-center gap-1.5 rounded-lg p-1.5 text-center transition-colors hover:bg-ink/[0.06]',
                      busy && 'opacity-50'
                    )}
                  >
                    <img
                      src={c.character.image}
                      alt=""
                      className="size-16 rounded-full object-cover ring-1 ring-ink/[0.08] group-hover:ring-mm-accent"
                    />
                    <span className="line-clamp-2 text-[11px] leading-tight text-ink/70">
                      {c.character.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : collection.isPending ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : withIds.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/40">
            {i18n._(msg`account.avatar.emptyCollection`)}
          </p>
        ) : (
          <div className="grid max-h-[50vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
            {withIds.map((anime) => (
              <button
                key={anime.id}
                type="button"
                onClick={() => setSeries(anime)}
                className="group flex flex-col gap-1.5 rounded-lg p-1.5 text-left transition-colors hover:bg-ink/[0.06]"
              >
                {anime.cover_image_url ? (
                  <img
                    src={anime.cover_image_url}
                    alt=""
                    className="aspect-[2/3] w-full rounded-md object-cover"
                  />
                ) : (
                  <div className="aspect-[2/3] w-full rounded-md bg-ink/[0.06]" />
                )}
                <span className="line-clamp-2 text-[11px] leading-tight text-ink/70">
                  {anime.title_zh ?? anime.title}
                </span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
