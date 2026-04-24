import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';
import { createTokenizer } from '@orama/tokenizers/mandarin';

const cjkTokenizer = createTokenizer();

const server = createFromSource(source, {
  localeMap: {
    'zh-CN': { tokenizer: cjkTokenizer },
    'zh-TW': { tokenizer: cjkTokenizer },
    'zh-HK': { tokenizer: cjkTokenizer },
  },
});

export const { GET } = server;
