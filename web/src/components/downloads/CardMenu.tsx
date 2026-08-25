// web/src/components/downloads/CardMenu.tsx

import {
  Copy01Icon,
  Delete02Icon,
  Link02Icon,
  MoreHorizontalIcon,
  Refresh03Icon,
  ToggleOnIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface Props {
  enabled: boolean;
  bangumiId: number | null;
  feedUrl: string;
  onToggleEnabled: () => void;
  onRefresh: () => void;
  onOpenAnime: () => void;
  onCopyRssUrl: () => void;
  onDelete: () => void;
}

export function CardMenu({
  enabled,
  bangumiId,
  feedUrl,
  onToggleEnabled,
  onRefresh,
  onOpenAnime,
  onCopyRssUrl,
  onDelete,
}: Props) {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);
  const animeDisabled = !bangumiId;

  function handle(fn: () => void) {
    return () => {
      fn();
      setOpen(false);
    };
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={i18n._(msg`downloads.menu.more`)}
          className={cn(
            'w-[26px] h-[26px] rounded-[7px] flex items-center justify-center',
            'text-ink/20 hover:text-ink hover:bg-ink/[0.06] transition-colors cursor-pointer',
            open && 'text-ink bg-ink/[0.06]'
          )}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        role="menu"
        align="end"
        sideOffset={6}
        className="w-[220px] p-1 bg-mm-bg-elevated border border-ink/[0.10] rounded-[10px] shadow-xl"
      >
        <MenuItem
          icon={ToggleOnIcon}
          label={i18n._(msg`downloads.menu.autoDownload`)}
          trailing={
            <span
              className={cn(
                'text-[10px] px-2 py-[2px] rounded-full tabular-nums',
                enabled ? 'bg-[rgba(74,222,128,0.15)] text-[#4ade80]' : 'bg-ink/[0.06] text-ink/40'
              )}
            >
              {enabled ? i18n._(msg`downloads.menu.on`) : i18n._(msg`downloads.menu.off`)}
            </span>
          }
          onClick={handle(onToggleEnabled)}
        />
        <MenuItem
          icon={Refresh03Icon}
          label={i18n._(msg`downloads.menu.refresh`)}
          onClick={handle(onRefresh)}
        />
        <MenuSeparator />
        <MenuItem
          icon={Link02Icon}
          label={i18n._(msg`downloads.menu.openAnime`)}
          disabled={animeDisabled}
          onClick={handle(onOpenAnime)}
        />
        <MenuItem
          icon={Copy01Icon}
          label={i18n._(msg`downloads.menu.copyRSS`)}
          onClick={handle(() => {
            navigator.clipboard.writeText(feedUrl).catch(() => {});
            onCopyRssUrl();
          })}
        />
        <MenuSeparator />
        <MenuItem
          icon={Delete02Icon}
          label={i18n._(msg`downloads.menu.delete`)}
          onClick={handle(onDelete)}
          danger
        />
      </PopoverContent>
    </Popover>
  );
}

function MenuItem({
  icon,
  label,
  trailing,
  onClick,
  disabled,
  danger,
}: {
  icon: Parameters<typeof HugeiconsIcon>[0]['icon'];
  label: string;
  trailing?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-[10px] px-[10px] py-[7px] rounded-md text-[12px]',
        'transition-colors text-left cursor-pointer',
        disabled && 'opacity-40 cursor-not-allowed',
        !disabled && !danger && 'text-ink/60 hover:text-ink hover:bg-ink/[0.04]',
        !disabled && danger && 'text-[#f87171] hover:bg-[rgba(248,113,113,0.08)]'
      )}
    >
      <HugeiconsIcon icon={icon} size={12} />
      <span className="flex-1">{label}</span>
      {trailing}
    </button>
  );
}

function MenuSeparator() {
  return <div className="h-px bg-ink/[0.05] my-1" />;
}
