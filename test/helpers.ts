import { zonedToUtc } from '../src/engine/time';
import type { Interval } from '../src/engine/types';

export const TZ = 'America/New_York';
const MIN = 60_000;

/** "2026-11-03", "1:00pm" → UTC ms in New York */
export function at(date: string, time: string, tz = TZ): number {
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(time);
  if (!m) throw new Error(`bad time ${time}`);
  let h = Number(m[1]) % 12;
  if (m[3] === 'pm') h += 12;
  return zonedToUtc(date, h * 60 + Number(m[2] ?? 0), tz);
}

export function block(date: string, start: string, end: string): Interval {
  return { start: at(date, start), end: at(date, end) };
}

export function slot30(date: string, start: string): Interval {
  const s = at(date, start);
  return { start: s, end: s + 30 * MIN };
}

export function allDay(date: string): Interval {
  return { start: zonedToUtc(date, 0, TZ), end: zonedToUtc(date, 24 * 60, TZ) };
}
