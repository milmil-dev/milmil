import { api } from '../api-client';

export interface MissingSearchResult {
  title: string;
  magnet?: string;
  torrent_url?: string;
  size_bytes: number;
  size_display?: string;
  seeders: number;
  leechers: number;
  info_hash?: string;
  provider: string;
  published_at?: string;
  parsed: {
    Title?: string;
    EpisodeNumber?: number;
    Season?: number;
    SubGroup?: string;
    Year?: number;
    Resolution?: number;
  };
}

export interface AutoRuleResult {
  rule_id: string;
  episode_range: string;
  action: 'created' | 'merged';
}

export const missingSearchApi = {
  search: (bangumiId: number, episode: number) =>
    api.post<{ results: MissingSearchResult[] }>(`/api/v1/anime/${bangumiId}/missing/search`, {
      episode_number: episode,
    }),
  download: (bangumiId: number, magnet: string, title: string) =>
    api.post<{ download_id: string }>(`/api/v1/anime/${bangumiId}/missing/download`, {
      magnet,
      title,
    }),
  autoRule: (bangumiId: number, episodeNumbers: number[], rssFeedId?: string) =>
    api.post<AutoRuleResult>(
      `/api/v1/anime/${bangumiId}/missing/auto-rule`,
      rssFeedId
        ? { episode_numbers: episodeNumbers, rss_feed_id: rssFeedId }
        : { episode_numbers: episodeNumbers }
    ),
};
