import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

// No localeMap/tokenizer config: the default `multilingual` tokenizer handles
// CJK, so the previous per-locale Mandarin tokenizer wiring is redundant.
export const { GET } = createFromSource(source);
