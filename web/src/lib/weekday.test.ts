import { describe, expect, it } from 'vite-plus/test';
import { todayWeekdayEN, WEEKDAY_EN } from './weekday';

describe('todayWeekdayEN', () => {
  it('returns a Mon–Sun key for Asia/Tokyo', () => {
    expect(WEEKDAY_EN).toContain(todayWeekdayEN());
  });

  it('uses JST, not the local calendar day', () => {
    // 2026-09-03 16:00 UTC is already Friday 01:00 in Tokyo.
    const utcThursdayEvening = new Date('2026-09-03T16:00:00Z');
    expect(todayWeekdayEN(utcThursdayEvening)).toBe('Fri');
    const utcThursdayMorning = new Date('2026-09-03T02:00:00Z');
    expect(todayWeekdayEN(utcThursdayMorning)).toBe('Thu');
  });
});
