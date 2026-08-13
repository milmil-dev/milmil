import { describe, expect, it } from 'vite-plus/test';
import { bucketByDate, type DatedItem } from './history-date-buckets';

function mk(id: string, iso: string): DatedItem {
  return { id, last_watched_at: iso };
}

describe('bucketByDate', () => {
  const now = new Date('2026-04-20T15:00:00Z'); // Monday

  it('groups items into today/yesterday/thisWeek/lastWeek/earlier', () => {
    const items: DatedItem[] = [
      mk('today1', '2026-04-20T14:00:00Z'),
      mk('today2', '2026-04-20T08:00:00Z'),
      mk('yest', '2026-04-19T20:00:00Z'), // Sunday
      mk('thisWeek', '2026-04-13T20:00:00Z'), // 7 days ago — still in the rolling thisWeek window
      mk('lastWeek', '2026-04-10T20:00:00Z'),
      mk('earlier', '2026-03-01T00:00:00Z'),
    ];
    const buckets = bucketByDate(items, now);
    expect(buckets.today.map((x) => x.id)).toEqual(['today1', 'today2']);
    expect(buckets.yesterday.map((x) => x.id)).toEqual(['yest']);
    expect(buckets.thisWeek.map((x) => x.id)).toEqual(['thisWeek']);
    expect(buckets.lastWeek.map((x) => x.id)).toEqual(['lastWeek']);
    expect(buckets.earlier.map((x) => x.id)).toEqual(['earlier']);
  });

  it('handles empty input', () => {
    expect(bucketByDate([], now)).toEqual({
      today: [],
      yesterday: [],
      thisWeek: [],
      lastWeek: [],
      earlier: [],
    });
  });

  it('treats midnight boundary as today', () => {
    const midnight = new Date('2026-04-20T00:00:00');
    const later = new Date('2026-04-20T12:00:00');
    const buckets = bucketByDate([mk('x', midnight.toISOString())], later);
    expect(buckets.today.map((x) => x.id)).toEqual(['x']);
  });
});
