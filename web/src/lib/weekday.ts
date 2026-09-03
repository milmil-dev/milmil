import { msg } from '@lingui/core/macro';
import type { useLingui } from '@lingui/react';

export const WEEKDAY_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type WeekdayEN = (typeof WEEKDAY_EN)[number];

type I18n = ReturnType<typeof useLingui>['i18n'];

/** `Mon`…`Sun` for today in Asia/Tokyo — the calendar's frame of reference. */
export function todayWeekdayEN(now = new Date()): WeekdayEN {
  const short = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(now);
  const compact = short.replace(/\.$/, '').slice(0, 3);
  return WEEKDAY_EN.find((day) => day === compact) ?? 'Mon';
}

/** Localized heading mark (月曜日 / Monday / 월요일) beside "Today's Schedule". */
export function weekdayFullName(weekday: string, i18n: I18n): string {
  switch (weekday) {
    case 'Mon':
      return i18n._(msg`weekday.full.Mon`);
    case 'Tue':
      return i18n._(msg`weekday.full.Tue`);
    case 'Wed':
      return i18n._(msg`weekday.full.Wed`);
    case 'Thu':
      return i18n._(msg`weekday.full.Thu`);
    case 'Fri':
      return i18n._(msg`weekday.full.Fri`);
    case 'Sat':
      return i18n._(msg`weekday.full.Sat`);
    case 'Sun':
      return i18n._(msg`weekday.full.Sun`);
    default:
      return weekday;
  }
}
