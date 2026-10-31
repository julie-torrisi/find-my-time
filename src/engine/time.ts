// Time-zone helpers built on Intl only (no dependencies, works in content scripts).

export interface LocalParts {
  date: string; // YYYY-MM-DD in the zone
  weekday: number; // 0 = Sunday … 6 = Saturday
  minutes: number; // minutes since local midnight
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function parts(ms: number, tz: string) {
  const p: Record<string, string> = {};
  for (const { type, value } of formatter(tz).formatToParts(new Date(ms))) p[type] = value;
  return p;
}

export function localParts(ms: number, tz: string): LocalParts {
  const p = parts(ms, tz);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    weekday: WEEKDAYS[p.weekday as string] ?? 0,
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

function offsetMs(ms: number, tz: string): number {
  const p = parts(ms, tz);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return asUtc - Math.floor(ms / 60000) * 60000;
}

/** UTC ms for a wall-clock time (date + minutes after midnight) in a zone. */
export function zonedToUtc(date: string, minutes: number, tz: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d) + minutes * 60000;
  let ms = guess - offsetMs(guess, tz);
  ms = guess - offsetMs(ms, tz); // second pass handles DST edges
  return ms;
}

/** "11am", "1:10pm" */
export function fmtTime(ms: number, tz: string): string {
  return fmtMinutes(localParts(ms, tz).minutes);
}

export function fmtMinutes(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const ap = h24 < 12 ? 'am' : 'pm';
  return m === 0 ? `${h}${ap}` : `${h}:${String(m).padStart(2, '0')}${ap}`;
}

/** "2–4pm", "11:30am–1pm" */
export function fmtRange(startMin: number, endMin: number): string {
  const a = fmtMinutes(startMin);
  const b = fmtMinutes(endMin);
  const sameHalf = startMin < 720 === endMin < 720 || (endMin === 720 && startMin >= 720);
  return sameHalf ? `${a.replace(/am|pm/, '')}–${b}` : `${a}–${b}`;
}
