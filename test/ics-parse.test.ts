import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseIcs } from '../src/background/sources/ics-parse';
import { defaultSettings, rankSlots } from '../src/engine';
import { TZ, at, allDay, block, slot30 } from './helpers';

const RANGE = { start: at('2026-10-31', '11:30am'), end: at('2026-11-14', '11:30am') };
const wrap = (body: string) => `BEGIN:VCALENDAR\nVERSION:2.0\n${body}\nEND:VCALENDAR`;
const ics = (body: string) => parseIcs(wrap(body), RANGE, TZ);

describe('parseIcs: test calendar fixture', () => {
  const busy = parseIcs(readFileSync('test/fixtures/test-calendar.ics', 'utf8'), RANGE, TZ);

  it('returns exactly the busy blocks (free events dropped, repeats expanded)', () => {
    // 9 single busy events (#1–#5, #7a–d) + 4 repeats of #8 (Nov 3, 5, 10, 12)
    expect(busy).toHaveLength(13);
  });
  it('timed events land at the right Eastern time after the clock change', () => {
    expect(busy).toContainEqual(block('2026-11-03', '1:00pm', '2:00pm'));
  });
  it('all-day busy covers the whole local day', () => {
    expect(busy).toContainEqual(allDay('2026-11-05'));
  });
  it('drops transparent events (all-day and timed)', () => {
    expect(busy.some((b) => b.start === allDay('2026-11-06').start)).toBe(false);
    expect(busy.some((b) => b.start === at('2026-11-13', '1:00pm'))).toBe(false);
  });
  it('feeds the engine: same answer-key results as the hand-written busy list', () => {
    const slots = ['2026-11-03', '2026-11-10', '2026-11-12'].flatMap((d) => ['11:00am', '12:35pm', '1:10pm'].map((t) => slot30(d, t)));
    const r = rankSlots(slots, busy, defaultSettings(TZ), { now: RANGE.start });
    const rule = (d: string, t: string) => r.hidden.find((h) => h.slot.start === at(d, t))?.rule;
    expect(rule('2026-11-03', '11:00am')).toBe('F2');
    expect(rule('2026-11-03', '1:10pm')).toBe('F1');
    expect(rule('2026-11-10', '12:35pm')).toBe('F1');
    expect(rule('2026-11-12', '12:35pm')).toBe('F1');
    expect(rule('2026-11-12', '1:10pm')).toBeUndefined();
  });
});

describe('parseIcs: edge cases', () => {
  it('EXDATE removes one occurrence', () => {
    const b = ics(`BEGIN:VEVENT\nUID:x\nDTSTART;TZID=America/New_York:20261102T100000\nDTEND;TZID=America/New_York:20261102T103000\nRRULE:FREQ=DAILY;COUNT=3\nEXDATE;TZID=America/New_York:20261103T100000\nEND:VEVENT`);
    expect(b.map((x) => x.start)).toEqual([at('2026-11-02', '10:00am'), at('2026-11-04', '10:00am')]);
  });
  it('a moved occurrence (RECURRENCE-ID) uses its new time', () => {
    const b = ics(`BEGIN:VEVENT\nUID:m\nDTSTART;TZID=America/New_York:20261102T100000\nDTEND;TZID=America/New_York:20261102T103000\nRRULE:FREQ=DAILY;COUNT=2\nEND:VEVENT\nBEGIN:VEVENT\nUID:m\nRECURRENCE-ID;TZID=America/New_York:20261103T100000\nDTSTART;TZID=America/New_York:20261103T150000\nDTEND;TZID=America/New_York:20261103T153000\nEND:VEVENT`);
    expect(b.map((x) => x.start)).toEqual([at('2026-11-02', '10:00am'), at('2026-11-03', '3:00pm')]);
  });
  it('a cancelled event does not block', () => {
    expect(ics(`BEGIN:VEVENT\nUID:c\nSTATUS:CANCELLED\nDTSTART:20261103T150000Z\nDTEND:20261103T160000Z\nEND:VEVENT`)).toHaveLength(0);
  });
  it('UTC times', () => {
    expect(ics(`BEGIN:VEVENT\nUID:u\nDTSTART:20261103T150000Z\nDTEND:20261103T160000Z\nEND:VEVENT`)).toEqual([block('2026-11-03', '10:00am', '11:00am')]);
  });
  it('floating times use the user’s zone', () => {
    expect(ics(`BEGIN:VEVENT\nUID:f\nDTSTART:20261103T100000\nDTEND:20261103T110000\nEND:VEVENT`)).toEqual([block('2026-11-03', '10:00am', '11:00am')]);
  });
  it('Outlook-style zone name with its own VTIMEZONE', () => {
    const b = ics(`BEGIN:VTIMEZONE\nTZID:Eastern Standard Time\nBEGIN:STANDARD\nDTSTART:16010101T020000\nTZOFFSETFROM:-0400\nTZOFFSETTO:-0500\nRRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11\nEND:STANDARD\nBEGIN:DAYLIGHT\nDTSTART:16010101T020000\nTZOFFSETFROM:-0500\nTZOFFSETTO:-0400\nRRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3\nEND:DAYLIGHT\nEND:VTIMEZONE\nBEGIN:VEVENT\nUID:o\nDTSTART;TZID=Eastern Standard Time:20261103T100000\nDTEND;TZID=Eastern Standard Time:20261103T110000\nEND:VEVENT`);
    expect(b).toEqual([block('2026-11-03', '10:00am', '11:00am')]);
  });
  it('a weekly repeat keeps local time across the clock change', () => {
    const b = ics(`BEGIN:VEVENT\nUID:w\nDTSTART;TZID=America/New_York:20261027T090000\nDTEND;TZID=America/New_York:20261027T093000\nRRULE:FREQ=WEEKLY;COUNT=3\nEND:VEVENT`);
    expect(b.map((x) => x.start)).toEqual([at('2026-11-03', '9:00am'), at('2026-11-10', '9:00am')]);
  });
  it('events outside the window are skipped', () => {
    expect(ics(`BEGIN:VEVENT\nUID:o2\nDTSTART:20261201T150000Z\nDTEND:20261201T160000Z\nEND:VEVENT`)).toHaveLength(0);
  });
  it('an endless daily rule stops at the window', () => {
    expect(ics(`BEGIN:VEVENT\nUID:d\nDTSTART:20200101T150000Z\nDTEND:20200101T153000Z\nRRULE:FREQ=DAILY\nEND:VEVENT`).length).toBeLessThanOrEqual(15);
  });
});
