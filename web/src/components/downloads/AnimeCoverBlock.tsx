// web/src/components/downloads/AnimeCoverBlock.tsx
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { placeholderGradient, placeholderLetter } from './placeholder';

interface Props {
  coverUrl?: string;
  title: string;
  className?: string;
}

export function AnimeCoverBlock({ coverUrl, title, className }: Props) {
  const [errored, setErrored] = useState(false);
  const showImage = coverUrl && !errored;

  return (
    <div
      className={cn(
        'relative w-[92px] h-[130px] flex-none rounded-lg overflow-hidden',
        'shadow-[0_4px_18px_rgba(0,0,0,0.4)]',
        className
      )}
      style={!showImage ? { background: placeholderGradient(title) } : undefined}
      {...(!showImage ? { role: 'img' as const, 'aria-label': title } : {})}
    >
      {showImage && (
        <img
          src={coverUrl}
          alt={title}
          loading="lazy"
          onError={() => setErrored(true)}
          className="w-full h-full object-cover"
        />
      )}
      {!showImage && (
        <div className="absolute inset-0 flex items-center justify-center text-white/40 text-3xl font-light">
          {placeholderLetter(title)}
        </div>
      )}
    </div>
  );
}
