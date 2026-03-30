import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { MediaInfo } from '@/lib/api/stream';
import type { SubtitleFile } from '@/lib/api/subtitle';
import { cn } from '@/lib/utils';

interface TechInfoPopoverProps {
  mediaInfo: MediaInfo | undefined;
  subtitles: SubtitleFile[] | undefined;
  transcodeStatus: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function TechInfoPopover({ mediaInfo, subtitles, transcodeStatus }: TechInfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const { i18n } = useLingui();

  return (
    <div className="absolute right-3 bottom-3 z-20">
      {/* Click-away backdrop */}
      {open && <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />}

      {/* Gear button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative z-40 flex h-8 w-8 items-center justify-center rounded-full',
          'bg-white/15 text-white/70 transition-colors hover:bg-white/25'
        )}
        aria-label={i18n._(msg`watch.playbackInfo`)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path
            fillRule="evenodd"
            d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Popover */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 bottom-full z-40 mb-2 w-64 rounded-lg border border-white/10 bg-black/90 p-3 backdrop-blur-md"
          >
            {/* File info */}
            {mediaInfo && (
              <section className="space-y-1 text-xs text-white/70">
                <h4 className="text-xs font-semibold text-white/90">
                  {i18n._(msg`watch.playbackInfo`)}
                </h4>
                <p className="truncate" title={mediaInfo.filename}>
                  {mediaInfo.filename}
                </p>
                {mediaInfo.width && mediaInfo.height && (
                  <p>
                    {mediaInfo.width}x{mediaInfo.height}
                  </p>
                )}
                <p>{[mediaInfo.video_codec, mediaInfo.audio_codec].filter(Boolean).join(' / ')}</p>
                <p>
                  {formatBytes(mediaInfo.size_bytes)}
                  {mediaInfo.duration_seconds != null &&
                    ` · ${formatDuration(mediaInfo.duration_seconds)}`}
                </p>
              </section>
            )}

            {/* Playback method */}
            {mediaInfo && (
              <section className="mt-3 space-y-1 border-t border-white/10 pt-2 text-xs text-white/70">
                <h4 className="text-xs font-semibold text-white/90">
                  {i18n._(msg`watch.playbackMethod`)}
                </h4>
                <p>
                  {i18n._(msg`watch.directStream`)} {mediaInfo.can_direct_play ? '✓' : '✗'}
                </p>
                {mediaInfo.can_remux && <p>Remux ✓</p>}
                <p>
                  {i18n._(msg`watch.transcode`)}{' '}
                  {transcodeStatus === 'ready'
                    ? '✓'
                    : transcodeStatus === 'processing'
                      ? '⏳'
                      : '—'}
                </p>
              </section>
            )}

            {/* Subtitles */}
            {subtitles && subtitles.length > 0 && (
              <section className="mt-3 border-t border-white/10 pt-2 text-xs text-white/70">
                <h4 className="mb-1 text-xs font-semibold text-white/90">
                  {i18n._(msg`watch.subtitle`)}
                </h4>
                <div className="flex flex-wrap gap-1">
                  {subtitles.map((sub) => (
                    <span
                      key={sub.id}
                      className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60"
                    >
                      {sub.language}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
