import { FolderLibraryIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Link } from '@tanstack/react-router';

export function LibraryEmptyState() {
  const { i18n } = useLingui();
  return (
    <Link
      to="/libraries"
      className="group block rounded-lg py-6 px-4 text-center transition-all duration-200 bg-white/[0.02] hover:bg-white/[0.04]"
    >
      <div className="mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-3 bg-white/[0.04] group-hover:bg-mm-accent/10 transition-colors">
        <HugeiconsIcon
          icon={FolderLibraryIcon}
          size={18}
          className="text-mm-text-muted group-hover:text-mm-accent transition-colors"
        />
      </div>
      <p className="text-sm font-medium text-white mb-1">{i18n._(msg`home.library.empty.title`)}</p>
      <p className="text-[12px] text-mm-text-tertiary">
        {i18n._(msg`home.library.empty.subtitle`)}
      </p>
    </Link>
  );
}
