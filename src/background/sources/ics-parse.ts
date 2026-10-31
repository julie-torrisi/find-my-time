// ICS text → busy intervals. Pure: no browser APIs, so it runs in tests and the service worker.
// Reads only DTSTART/DTEND/DURATION/RRULE/EXDATE/RECURRENCE-ID/TRANSP/STATUS.
// SUMMARY, DESCRIPTION, LOCATION and attendees are never read.
import ICAL from 'ical.js';
import type { Interval } from '../../engine/types';
import { zonedToUtc } from '../../engine/time';

const MAX_OCCURRENCES = 5000; // per recurring event; guards against runaway rules

export interface IcsRange {
  start: number;
  end: number;
}

export function parseIcs(text: string, range: IcsRange, userTz: string): Interval[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const vtz of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(new ICAL.Timezone(vtz));
    } catch {
      /* a broken VTIMEZONE falls back to the IANA name or the user's zone */
    }
  }

  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const vevent of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(vevent);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  const orphans: ICAL.Event[] = [];
  for (const exc of exceptions) {
    const master = masters.get(exc.uid);
    if (master?.isRecurring()) master.relateException(exc);
    else orphans.push(exc);
  }

  const out: Interval[] = [];
  const push = (startT: ICAL.Time, endT: ICAL.Time, item: ICAL.Event) => {
    if (!blocks(item)) return;
    const start = toMs(startT, userTz);
    const end = toMs(endT, userTz);
    if (end > start && start < range.end && end > range.start) out.push({ start, end });
  };

  for (const ev of [...masters.values(), ...orphans]) {
    if (!ev.startDate) continue;
    if (!ev.isRecurring()) {
      push(ev.startDate, ev.endDate, ev);
      continue;
    }
    const it = ev.iterator();
    for (let i = 0, next = it.next(); next && i < MAX_OCCURRENCES; i++, next = it.next()) {
      const d = ev.getOccurrenceDetails(next);
      if (toMs(d.startDate, userTz) >= range.end) break;
      push(d.startDate, d.endDate, d.item);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function blocks(ev: ICAL.Event): boolean {
  const transp = String(ev.component.getFirstPropertyValue('transp') ?? '').toUpperCase();
  const status = String(ev.component.getFirstPropertyValue('status') ?? '').toUpperCase();
  return transp !== 'TRANSPARENT' && status !== 'CANCELLED';
}

function validIana(tz: string | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function toMs(t: ICAL.Time, userTz: string): number {
  const date = `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  if (t.isDate) return zonedToUtc(date, 0, userTz); // all-day: the user's local midnight
  const minutes = t.hour * 60 + t.minute;
  const zone = t.zone;
  if (zone === ICAL.Timezone.utcTimezone) return t.toUnixTime() * 1000;
  const tzid = (t as ICAL.Time & { timezone?: string }).timezone ?? zone?.tzid; // set at runtime, not in the typings
  if (validIana(tzid)) return zonedToUtc(date, minutes, tzid) + t.second * 1000;
  if (zone && zone !== ICAL.Timezone.localTimezone && zone.tzid !== 'floating') return t.toUnixTime() * 1000;
  return zonedToUtc(date, minutes, userTz) + t.second * 1000; // floating time
}
