import { Cancel01Icon, Search01Icon, Tag01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { discoverApi, type HotTag } from '@/lib/api/discover';
import { cn } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

/** Category display order and labels */
const CATEGORY_ORDER = [
  'genre',
  'mood',
  'setting',
  'source',
  'theme',
  'style',
  'studio',
  'activity',
  'misc',
] as const;
const CATEGORY_LABELS: Record<string, ReturnType<typeof msg>> = {
  genre: msg`search.tag.genre`,
  mood: msg`search.tag.mood`,
  setting: msg`search.tag.setting`,
  source: msg`search.tag.source`,
  theme: msg`search.tag.theme`,
  style: msg`search.tag.style`,
  studio: msg`search.tag.studio`,
  activity: msg`search.tag.activity`,
  misc: msg`search.tag.misc`,
};

interface TagMultiSelectProps {
  selected: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}

export function TagMultiSelect({ selected, onAdd, onRemove }: TagMultiSelectProps) {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: hotTags = [] } = useQuery({
    queryKey: ['discover', 'hotTags'],
    queryFn: () => discoverApi.hotTags(),
    staleTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setSearch('');
    }
  }, [open]);

  const tagNames = useMemo(() => hotTags.map((t) => t.name), [hotTags]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const tags = q
      ? hotTags.filter(
          (t) => t.name.toLowerCase().includes(q) || (t.display ?? '').toLowerCase().includes(q)
        )
      : hotTags;
    // Group by category
    const grouped = new Map<string, HotTag[]>();
    for (const tag of tags) {
      const cat = tag.category || 'misc';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(tag);
    }
    return grouped;
  }, [hotTags, search]);

  const handleSelect = (name: string) => {
    if (selected.includes(name)) {
      onRemove(name);
    } else {
      onAdd(name);
    }
  };

  const handleCustomTag = () => {
    const trimmed = search.trim();
    if (trimmed && !selected.includes(trimmed)) {
      onAdd(trimmed);
      setSearch('');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs cursor-pointer transition-colors',
            'bg-ink/[0.04] border border-transparent hover:bg-ink/[0.07]',
            selected.length > 0 ? 'text-mm-accent' : 'text-ink/70'
          )}
        >
          <HugeiconsIcon icon={Tag01Icon} size={13} />
          {selected.length > 0
            ? `${i18n._(msg`search.filter.tags`)} (${selected.length})`
            : i18n._(msg`search.filter.tags`)}
        </motion.button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[320px] p-0 bg-mm-glass border-ink/[0.08] backdrop-blur-xl shadow-2xl"
      >
        <Command shouldFilter={false} className="bg-transparent">
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-ink/[0.06] px-3 h-9">
            <HugeiconsIcon icon={Search01Icon} size={14} className="shrink-0 text-ink/30" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCustomTag();
                }
              }}
              placeholder={i18n._(msg`search.filter.tagSearch`)}
              className="flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-ink/30"
            />
          </div>

          {/* Selected tags as chips */}
          <AnimatePresence>
            {selected.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden border-b border-ink/[0.06]"
              >
                <div className="flex flex-wrap gap-1 px-2.5 py-2">
                  {selected.map((tag) => (
                    <motion.span
                      key={tag}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-mm-accent/15 text-mm-accent"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => onRemove(tag)}
                        className="text-mm-accent/50 hover:text-mm-accent transition-colors"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={9} />
                      </button>
                    </motion.span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <CommandList className="max-h-[240px] overflow-y-auto scrollbar-none">
            {/* Custom tag option */}
            {search.trim() && !tagNames.includes(search.trim()) && (
              <CommandItem
                onSelect={handleCustomTag}
                className="text-xs text-ink/50 mx-1 mt-1 rounded data-[selected=true]:bg-ink/[0.06] data-[selected=true]:text-ink"
              >
                <HugeiconsIcon icon={Tag01Icon} size={12} className="text-mm-accent/60" />
                {i18n._(msg`search.filter.addCustomTag`)} &ldquo;{search.trim()}&rdquo;
              </CommandItem>
            )}

            <CommandEmpty className="py-6 text-xs text-ink/25">
              {i18n._(msg`search.filter.noTags`)}
            </CommandEmpty>

            {/* Grouped tag list */}
            {CATEGORY_ORDER.map((cat) => {
              const tags = filtered.get(cat);
              if (!tags || tags.length === 0) return null;
              return (
                <CommandGroup
                  key={cat}
                  heading={
                    <span className="text-[10px] font-medium uppercase tracking-wider text-ink/25 px-1">
                      {CATEGORY_LABELS[cat] ? i18n._(CATEGORY_LABELS[cat]!) : cat}
                    </span>
                  }
                  className="px-1"
                >
                  <div className="flex flex-wrap gap-1 px-1 pb-1.5">
                    {tags.map((tag) => {
                      const isSelected = selected.includes(tag.name);
                      return (
                        <CommandItem
                          key={tag.name}
                          value={tag.name}
                          onSelect={() => handleSelect(tag.name)}
                          className={cn(
                            'inline-flex !px-2 !py-1 rounded text-[11px] font-medium cursor-pointer transition-colors',
                            isSelected
                              ? 'bg-mm-accent/15 text-mm-accent data-[selected=true]:bg-mm-accent/20'
                              : 'bg-ink/[0.04] text-ink/50 hover:text-ink/70 data-[selected=true]:bg-ink/[0.08] data-[selected=true]:text-ink/70'
                          )}
                        >
                          {tag.display ?? tag.name}
                        </CommandItem>
                      );
                    })}
                  </div>
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
