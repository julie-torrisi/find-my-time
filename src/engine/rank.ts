// Ranking pipeline: hard filters → scoring → top 3. Deterministic and local.
// Every reason string comes from the rule that actually fired.
import type { Interval, Slot } from './types';
import type { Settings } from './settings';
import { DAY_NAMES, fmtMinutes, fmtRange, localParts, zonedToUtc } from './time';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export interface Reason {
  rule: string;
  points: number;
  text: string;
}

export interface Ranked {
  slot: Slot;
  score: number;
  verdict: 'best' | 'fits' | 'tight';
  rank?: 1 | 2 | 3;
  reasons: Reason[]; // strongest first
  primary: string;
  secondary?: string;
}

export interface Hidden {
  slot: Slot;
  rule: string;
  reason: string;
}

export interface RankResult {
  best: Ranked[];
  kept: Ranked[]; // all kept slots, best first
  hidden: Hidden[];
  warnings: string[];
}

export interface RankOptions {
  now: number;
  pageTimeZone?: string;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

interface DayInfo {
  dayStart: number;
  dayEnd: number;
  busy: Interval[]; // overlapping this local day, sorted
  timedCount: number; // meetings that day (not counting all-day blocks)
}

export function rankSlots(slots: Slot[], busyIn: Interval[], s: Settings, opts: RankOptions): RankResult {
  const tz = s.timeZone;
  const busy = [...busyIn].sort((a, b) => a.start - b.start);
  const days = new Map<string, DayInfo>();
  const dayInfo = (date: string): DayInfo => {
    let d = days.get(date);
    if (!d) {
      const dayStart = zonedToUtc(date, 0, tz);
      const dayEnd = zonedToUtc(date, 24 * 60, tz);
      const dayBusy = busy.filter((b) => overlaps(b, { start: dayStart, end: dayEnd }));
      const timedCount = dayBusy.filter((b) => !(b.start <= dayStart && b.end >= dayEnd) && b.end - b.start < DAY).length;
      d = { dayStart, dayEnd, busy: dayBusy, timedCount };
      days.set(date, d);
    }
    return d;
  };
  const local = (ms: number) => localParts(ms, tz);
  const span = (b: Interval) => fmtRange(local(b.start).minutes, local(b.end).minutes || 24 * 60);

  const hidden: Hidden[] = [];
  const kept: Ranked[] = [];

  for (const slot of slots) {
    const L = local(slot.start);
    const endMin = L.minutes + Math.round((slot.end - slot.start) / MIN);
    const day = dayInfo(L.date);
    const dayName = DAY_NAMES[L.weekday] as string;
    const hide = (rule: string, reason: string) => hidden.push({ slot, rule, reason });

    // ---- Hard filters (first match wins) ----
    if (slot.start < opts.now + s.minNoticeMin * MIN) {
      hide('F5', slot.start < opts.now ? 'Already passed' : `Too soon: less than ${fmtNotice(s.minNoticeMin)} away`);
      continue;
    }
    if (s.blockedWeekdays.includes(L.weekday)) {
      hide('F4', `You keep ${dayName}s meeting-free`);
      continue;
    }
    if (s.blockedDates.includes(L.date)) {
      hide('F4', `You blocked ${dayName}, ${L.date}`);
      continue;
    }
    if (L.minutes < s.workHours.start || endMin > s.workHours.end) {
      hide('F3', `Outside your hours (${fmtRange(s.workHours.start, s.workHours.end)})`);
      continue;
    }
    const conflict = day.busy.find((b) => overlaps(b, slot));
    if (conflict) {
      const allDay = conflict.start <= day.dayStart && conflict.end >= day.dayEnd;
      hide('F1', allDay ? `Your calendar is busy all day ${dayName}` : `Conflicts with something on your calendar, ${span(conflict)}`);
      continue;
    }
    const buf = s.bufferMin * MIN;
    const before = lastEndingBefore(day.busy, slot.start);
    const after = firstStartingAfter(day.busy, slot.end);
    if (before && slot.start - before.end < buf) {
      hide('F2', `Leaves no break after your ${fmtMinutes(local(before.start).minutes)} (needs ${s.bufferMin} min)`);
      continue;
    }
    if (after && after.start - slot.end < buf) {
      hide('F2', `Leaves no break before your ${fmtMinutes(local(after.start).minutes)} (needs ${s.bufferMin} min)`);
      continue;
    }

    // ---- Scoring ----
    const reasons: Reason[] = [];
    const add = (rule: string, points: number, text: string) => reasons.push({ rule, points, text });
    const near = buf + 30 * MIN;

    if (before && slot.start - before.end <= near) {
      add('R1', 30, `Right after your ${fmtMinutes(local(before.start).minutes)}, so the rest of ${dayName} stays open`);
    } else if (after && after.start - slot.end <= near) {
      add('R1', 30, `Right before your ${fmtMinutes(local(after.start).minutes)}, so the rest of ${dayName} stays open`);
    }
    if (day.timedCount > 0 && day.timedCount < s.dayLoadCap) {
      add('R2', 20, `${dayName} already has meetings, so other days stay free`);
    }
    for (const f of s.focusBlocks.filter((f) => f.days.includes(L.weekday))) {
      const label = fmtRange(f.start, f.end);
      if (L.minutes < f.end && endMin > f.start) add('R3', -40, `Cuts into your ${label} focus block`);
      else add('R3', 15, `Keeps your ${label} focus block free`);
    }
    if (s.protectedWeekdays.includes(L.weekday)) add('R4', -25, `Lands on ${dayName}, which you keep open`);
    if (s.preferredWeekdays.includes(L.weekday)) add('R5', 10, `${dayName} is one of your preferred days`);
    if (s.avoidEdges && L.weekday === 1 && L.minutes < 12 * 60) add('R6', -15, 'Takes Monday morning');
    if (s.avoidEdges && L.weekday === 5 && endMin > 12 * 60) add('R6', -15, 'Takes Friday afternoon');
    const stretch = longestFreeStretch(day, slot, s);
    if (stretch && stretch.end - stretch.start >= s.longStretchMin) {
      add('R7', 10, `Leaves ${fmtRange(stretch.start, stretch.end)} free in one stretch`);
    }
    if (day.timedCount >= s.dayLoadCap) add('R8', -20, `${dayName} already has ${day.timedCount} meetings`);
    if (s.lunch && L.minutes < s.lunch.end && endMin > s.lunch.start) {
      add('R9', -10, `Lands in your lunch (${fmtRange(s.lunch.start, s.lunch.end)})`);
    }
    if (s.interviewMode) {
      if (s.interviewDates.includes(L.date)) add('R10', -30, `You already have an interview on ${dayName}`);
      else if (!before || slot.start - before.end >= 30 * MIN) add('R10', 10, `Your only interview that day, with 30 min to prep`);
    }
    const daysAway = Math.floor((slot.start - opts.now) / DAY);
    const soon = Math.max(0, 14 - daysAway);
    if (soon > 0) add('R11', soon, 'Earliest good option');

    const score = reasons.reduce((n, r) => n + r.points, 0);
    reasons.sort((a, b) => order(b) - order(a));
    const shown = reasons.filter((r) => r.rule !== 'R11' || reasons.length === 1);
    kept.push({
      slot,
      score,
      verdict: score < 0 ? 'tight' : 'fits',
      reasons,
      // A tight slot leads with what's wrong with it; others lead with their best reason.
      primary:
        (score < 0 ? [...reasons].filter((x) => x.points < 0).sort((a, b) => a.points - b.points)[0]?.text : undefined) ??
        (shown[0] ?? reasons[0])?.text ??
        'Fits your calendar',
      secondary: shown[1] && shown[1].points > 0 && score >= 0 ? shown[1].text : undefined,
    });
  }

  kept.sort((a, b) => b.score - a.score || a.slot.start - b.slot.start);
  const best = kept.filter((r) => r.score >= 0).slice(0, 3);
  best.forEach((r, i) => {
    r.verdict = 'best';
    r.rank = (i + 1) as 1 | 2 | 3;
  });

  const warnings: string[] = [];
  if (opts.pageTimeZone && opts.pageTimeZone !== tz) {
    warnings.push(`This page shows ${opts.pageTimeZone} time; shown here in ${tz}`); // R12
  }
  return { best, kept, hidden, warnings };
}

// Positive reasons first (strongest first), then negatives (worst first). R11 sorts last.
function order(r: Reason): number {
  if (r.rule === 'R11') return -1e6;
  return r.points > 0 ? 1e3 + r.points : -1e3 - r.points;
}

function fmtNotice(min: number): string {
  return min % 60 === 0 ? `${min / 60} hour${min === 60 ? '' : 's'}` : `${min} min`;
}

function lastEndingBefore(busy: Interval[], t: number): Interval | undefined {
  let found: Interval | undefined;
  for (const b of busy) if (b.end <= t && (!found || b.end > found.end)) found = b;
  return found;
}

function firstStartingAfter(busy: Interval[], t: number): Interval | undefined {
  let found: Interval | undefined;
  for (const b of busy) if (b.start >= t && (!found || b.start < found.start)) found = b;
  return found;
}

/** Longest free window (in local minutes) inside work hours once the slot is booked. */
function longestFreeStretch(
  day: DayInfo,
  slot: Slot,
  s: Settings,
): { start: number; end: number } | null {
  const toMin = (ms: number) => Math.round((ms - day.dayStart) / MIN);
  const blocks = [...day.busy, slot]
    .map((b) => ({ start: Math.max(0, toMin(b.start)), end: Math.min(24 * 60, toMin(b.end)) }))
    .sort((a, b) => a.start - b.start);
  let cursor = s.workHours.start;
  let bestStretch: { start: number; end: number } | null = null;
  const consider = (start: number, end: number) => {
    if (end > start && (!bestStretch || end - start > bestStretch.end - bestStretch.start)) bestStretch = { start, end };
  };
  for (const b of blocks) {
    if (b.end <= cursor) continue;
    consider(cursor, Math.min(b.start, s.workHours.end));
    cursor = Math.max(cursor, b.end);
    if (cursor >= s.workHours.end) break;
  }
  consider(cursor, s.workHours.end);
  return bestStretch;
}
