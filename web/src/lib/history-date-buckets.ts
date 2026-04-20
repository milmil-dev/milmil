export interface DatedItem {
  id: string;
  last_watched_at: string;
}

export interface DateBuckets<T extends DatedItem> {
  today: T[];
  yesterday: T[];
  thisWeek: T[];
  lastWeek: T[];
  earlier: T[];
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export function bucketByDate<T extends DatedItem>(items: T[], now: Date): DateBuckets<T> {
  const today0 = startOfDay(now);
  const yesterday0 = addDays(today0, -1);
  const thisWeek0 = addDays(today0, -7);
  const lastWeek0 = addDays(today0, -14);

  const buckets: DateBuckets<T> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    lastWeek: [],
    earlier: [],
  };
  for (const item of items) {
    const t = new Date(item.last_watched_at).getTime();
    if (t >= today0.getTime()) buckets.today.push(item);
    else if (t >= yesterday0.getTime()) buckets.yesterday.push(item);
    else if (t >= thisWeek0.getTime()) buckets.thisWeek.push(item);
    else if (t >= lastWeek0.getTime()) buckets.lastWeek.push(item);
    else buckets.earlier.push(item);
  }
  return buckets;
}
