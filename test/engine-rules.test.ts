import { describe, expect, it } from 'vitest';
import { defaultSettings, rankSlots, fmtRange } from '../src/engine';
import { TZ, at, block, slot30 } from './helpers';

const NOW = at('2026-11-01', '9:00am'); // Sunday, the morning clocks go back
const s = () => defaultSettings(TZ);
const run = (slots: ReturnType<typeof slot30>[], busy = [] as ReturnType<typeof block>[], settings = s()) =>
  rankSlots(slots, busy, settings, { now: NOW });

describe('hard filters', () => {
  it('F1 hides a slot that overlaps a busy block, with the busy time', () => {
    const r = run([slot30('2026-11-03', '1:30pm')], [block('2026-11-03', '1:00pm', '2:00pm')]);
    expect(r.hidden[0]).toMatchObject({ rule: 'F1', reason: 'Conflicts with something on your calendar, 1–2pm' });
  });
  it('F2 hides a slot inside the buffer', () => {
    const r = run([slot30('2026-11-03', '11:00am')], [block('2026-11-03', '10:15am', '10:55am')]);
    expect(r.hidden[0]).toMatchObject({ rule: 'F2', reason: 'Leaves no break after your 10:15am (needs 10 min)' });
  });
  it('F2 keeps a slot exactly one buffer away', () => {
    const r = run([slot30('2026-11-03', '11:00am')], [block('2026-11-03', '10:00am', '10:50am')]);
    expect(r.hidden).toHaveLength(0);
  });
  it('F3 hides slots that start early or end late (checks the end time)', () => {
    const r = run([slot30('2026-11-03', '8:30am'), slot30('2026-11-03', '4:45pm'), slot30('2026-11-03', '4:30pm')]);
    expect(r.hidden.map((h) => h.rule)).toEqual(['F3', 'F3']);
    expect(r.kept).toHaveLength(1);
  });
  it('F4 hides weekends and blocked dates', () => {
    const settings = { ...s(), blockedDates: ['2026-11-04'] };
    const r = run([slot30('2026-11-07', '10:00am'), slot30('2026-11-04', '10:00am')], [], settings);
    expect(r.hidden.map((h) => h.reason)).toEqual(['You keep Saturdays meeting-free', 'You blocked Wednesday, 2026-11-04']);
  });
  it('F5 hides slots under minimum notice', () => {
    const r = run([slot30('2026-11-01', '11:00am')]);
    expect(r.hidden[0]?.rule).toBe('F5');
  });
});

describe('scoring', () => {
  it('R1 rewards sitting next to a meeting', () => {
    const r = run([slot30('2026-11-04', '11:00am')], [block('2026-11-04', '10:00am', '10:50am')]);
    expect(r.best[0]?.primary).toBe('Right after your 10am, so the rest of Wednesday stays open');
  });
  it('R3 penalizes cutting a focus block', () => {
    const settings = { ...s(), focusBlocks: [{ days: [1, 2, 3, 4, 5], start: 14 * 60, end: 16 * 60 }] };
    const r = run([slot30('2026-11-04', '2:30pm'), slot30('2026-11-04', '10:00am')], [], settings);
    const cut = r.kept.find((k) => k.slot.start === at('2026-11-04', '2:30pm'));
    expect(cut?.reasons.some((x) => x.text === 'Cuts into your 2–4pm focus block')).toBe(true);
    expect(r.best[0]?.slot.start).toBe(at('2026-11-04', '10:00am'));
  });
  it('R4 + R6 push Friday afternoon down', () => {
    const settings = { ...s(), protectedWeekdays: [5] };
    const r = run([slot30('2026-11-06', '2:00pm')], [], settings);
    expect(r.kept[0]?.verdict).toBe('tight');
    expect(r.best).toHaveLength(0);
  });
  it('R8 flags a full day', () => {
    const busy = ['9:00am', '9:45am', '10:30am', '2:30pm'].map((t, i) =>
      block('2026-11-10', t, ['9:30am', '10:15am', '11:00am', '3:00pm'][i] as string));
    const r = run([slot30('2026-11-10', '1:10pm')], busy);
    expect(r.kept[0]?.reasons.some((x) => x.text === 'Tuesday already has 4 meetings')).toBe(true);
  });
  it('R9 penalizes lunch', () => {
    const r = run([slot30('2026-11-04', '12:00pm')]);
    expect(r.kept[0]?.reasons.some((x) => x.rule === 'R9')).toBe(true);
  });
  it('R10 interview mode avoids a second interview that day', () => {
    const settings = { ...s(), interviewMode: true, interviewDates: ['2026-11-04'] };
    const r = run([slot30('2026-11-04', '10:00am'), slot30('2026-11-05', '10:00am')], [], settings);
    expect(r.best[0]?.slot.start).toBe(at('2026-11-05', '10:00am'));
  });
  it('R11 sooner wins ties', () => {
    const r = run([slot30('2026-11-05', '10:00am'), slot30('2026-11-04', '10:00am')]);
    expect(r.best[0]?.slot.start).toBe(at('2026-11-04', '10:00am'));
  });
  it('R12 warns when the page shows another time zone', () => {
    const r = rankSlots([], [], s(), { now: NOW, pageTimeZone: 'America/Los_Angeles' });
    expect(r.warnings[0]).toContain('America/Los_Angeles');
  });
  it('top 3 only, numbered', () => {
    const slots = ['10:00am', '11:00am', '1:00pm', '2:00pm', '3:00pm'].map((t) => slot30('2026-11-04', t));
    const r = run(slots);
    expect(r.best.map((b) => b.rank)).toEqual([1, 2, 3]);
  });
});

describe('formatting', () => {
  it('ranges', () => {
    expect(fmtRange(14 * 60, 16 * 60)).toBe('2–4pm');
    expect(fmtRange(11 * 60 + 30, 13 * 60)).toBe('11:30am–1pm');
    expect(fmtRange(9 * 60, 17 * 60)).toBe('9am–5pm');
  });
});
