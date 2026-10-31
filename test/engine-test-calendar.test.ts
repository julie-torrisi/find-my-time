// Replays the "find-my-time test" Google calendar (12 fake events) against the answer key.
// Free events (#6, #9) are left out because freeBusy never returns them.
import { describe, expect, it } from 'vitest';
import { defaultSettings, rankSlots } from '../src/engine';
import { TZ, at, allDay, block, slot30 } from './helpers';

const busy = [
  block('2026-11-03', '1:00pm', '2:00pm'), // #1
  block('2026-11-03', '10:15am', '10:55am'), // #2
  block('2026-11-04', '10:00am', '10:50am'), // #3
  block('2026-11-04', '3:00pm', '3:45pm'), // #4
  allDay('2026-11-05'), // #5
  block('2026-11-10', '9:00am', '9:30am'), // #7a
  block('2026-11-10', '9:45am', '10:15am'), // #7b
  block('2026-11-10', '10:30am', '11:00am'), // #7c
  block('2026-11-10', '2:30pm', '3:00pm'), // #7d
  ...['2026-11-03', '2026-11-05', '2026-11-10', '2026-11-12'].map((d) => block(d, '12:30pm', '12:50pm')), // #8
];

const TIMES = ['11:00am', '12:00pm', '12:35pm', '1:10pm', '1:45pm', '3:15pm', '4:00pm'];
const DATES = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-10', '2026-11-12', '2026-11-13'];
const slots = DATES.flatMap((d) => TIMES.map((t) => slot30(d, t)));

const r = rankSlots(slots, busy, defaultSettings(TZ), { now: at('2026-10-31', '11:30am') });
const hiddenAt = (d: string, t: string) => r.hidden.find((h) => h.slot.start === at(d, t));
const keptAt = (d: string, t: string) => r.kept.find((k) => k.slot.start === at(d, t));

describe('test calendar answer key', () => {
  it('#1 F1: 1:10 and 1:45 on Nov 3 hidden', () => {
    expect(hiddenAt('2026-11-03', '1:10pm')?.rule).toBe('F1');
    expect(hiddenAt('2026-11-03', '1:45pm')?.rule).toBe('F1');
  });
  it('#2 F2: 11:00 on Nov 3 hidden for buffer', () => expect(hiddenAt('2026-11-03', '11:00am')?.rule).toBe('F2'));
  it('#3 R1: 11:00 on Nov 4 kept, "Right after…"', () =>
    expect(keptAt('2026-11-04', '11:00am')?.primary).toMatch(/^Right after your 10am/));
  it('#4: 3:15 hidden, 4:00 next to the meeting', () => {
    expect(hiddenAt('2026-11-04', '3:15pm')?.rule).toBe('F1');
    expect(keptAt('2026-11-04', '4:00pm')?.reasons.some((x) => x.rule === 'R1')).toBe(true);
  });
  it('#5 all-day busy: every Nov 5 slot hidden with the all-day reason', () => {
    const thu = r.hidden.filter((h) => h.reason === 'Your calendar is busy all day Thursday');
    expect(thu).toHaveLength(TIMES.length);
  });
  it('#6 all-day free: nothing hidden on Nov 6 by the calendar', () =>
    expect(r.hidden.filter((h) => h.slot.start >= at('2026-11-06', '12:00am') && h.slot.start < at('2026-11-07', '12:00am'))).toHaveLength(0));
  it('#7 day cap on Nov 10, and 11:00 hidden for buffer', () => {
    expect(hiddenAt('2026-11-10', '11:00am')?.rule).toBe('F2');
    expect(keptAt('2026-11-10', '1:10pm')?.reasons.some((x) => x.rule === 'R8')).toBe(true);
  });
  it('#8 recurring: 12:35 hidden on Nov 10 and 12', () => {
    expect(hiddenAt('2026-11-10', '12:35pm')?.rule).toBe('F1');
    expect(hiddenAt('2026-11-12', '12:35pm')?.rule).toBe('F1');
  });
  it('#9 free timed event: 1:10 and 1:45 on Nov 13 stay open', () => {
    expect(keptAt('2026-11-13', '1:10pm')).toBeDefined();
    expect(keptAt('2026-11-13', '1:45pm')).toBeDefined();
  });
  it('top 3 never conflicts with a busy block (launch quality gate)', () => {
    expect(r.best).toHaveLength(3);
    for (const b of r.best) expect(busy.some((x) => x.start < b.slot.end && b.slot.start < x.end)).toBe(false);
  });
  it('prints the top 3 for a human check', () => {
    console.log(r.best.map((b) => `${b.rank}. ${new Date(b.slot.start).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${b.primary}${b.secondary ? ' · ' + b.secondary : ''} (${b.score})`).join('\n'));
  });
});
