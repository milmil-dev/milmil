import { useLingui } from '@lingui/react';
import { Link } from '@tanstack/react-router';

export function HistoryEmptyState() {
  const { i18n } = useLingui();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.04] text-white/40">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      </div>
      <p className="text-[15px] font-medium text-white/80">{i18n._('history.empty.title')}</p>
      <p className="mt-1.5 max-w-sm text-[13px] text-white/40">
        {i18n._('history.empty.description')}
      </p>
      <Link
        to="/"
        className="mt-6 rounded-md bg-white/[0.06] px-4 py-2 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/[0.10] hover:text-white"
      >
        {i18n._('nav.home')}
      </Link>
    </div>
  );
}
