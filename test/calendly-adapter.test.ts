// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { calendly, findTimeButtons, markSlot, readDurationMin, readSelectedDate } from '../src/content/adapters/calendly';
import { parseDateHeading, parseDuration, parseTimeText } from '../src/content/read-times';
import { defaultSettings, rankSlots } from '../src/engine';
import { TZ, at, block } from './helpers';

const html = readFileSync('test/fixtures/calendly-mock-day.html', 'utf8');
const page = (url: string) => new JSDOM(html, { url }).window.document;
const NOW = new Date('2026-11-04T12:00:00-05:00');

describe('text parsing', () => {
  it('times', () => {
    expect(parseTimeText('9:00am')).toBe(540);
    expect(parseTimeText(' 12:35 PM ')).toBe(755);
    expect(parseTimeText('12:00am')).toBe(0);
    expect(parseTimeText('14:30')).toBe(870);
    expect(parseTimeText('10')).toBeNull();
    expect(parseTimeText('Next')).toBeNull();
  });
  it('date headings', () => {
    expect(parseDateHeading('Tuesday, November 10', NOW)).toBe('2026-11-10');
    expect(parseDateHeading('Monday, January 4', new Date('2026-12-20'))).toBe('2027-01-04');
    expect(parseDateHeading('Select a Date & Time', NOW)).toBeNull();
  });
  it('durations', () => {
    expect(parseDuration('Intro call 30 min')).toBe(30);
    expect(parseDuration('1 hr')).toBe(60);
    expect(parseDuration('1 hour 30 minutes')).toBe(90);
  });
});

describe('calendly adapter', () => {
  it('matches calendly hosts only', () => {
    expect(calendly.matches(new URL('https://calendly.com/x/y'), page('https://calendly.com/x/y'))).toBe(true);
    expect(calendly.matches(new URL('https://notcalendly.com/'), page('https://notcalendly.com/'))).toBe(false);
  });
  it('reads the date from ?date= first, else the heading', () => {
    expect(readSelectedDate(page('https://calendly.com/x/y?date=2026-11-12'), new URL('https://calendly.com/x/y?date=2026-11-12'), NOW)).toBe('2026-11-12');
    expect(readSelectedDate(page('https://calendly.com/x/y'), new URL('https://calendly.com/x/y'), NOW)).toBe('2026-11-10');
  });
  it('finds only time buttons (not date cells or Next)', () => {
    const btns = findTimeButtons(page('https://calendly.com/x/y'));
    expect(btns.map((b) => b.el.textContent)).toEqual(['9:00am', '11:00am', '12:35pm', '1:10pm', '3:15pm', '4:00pm']);
  });
  it('reads the duration', () => expect(readDurationMin(page('https://calendly.com/x/y'))).toBe(30));
  it('turns buttons into slots in the browser zone', () => {
    const doc = page('https://calendly.com/x/y?date=2026-11-10');
    const slots = calendly.readVisibleSlots(doc);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(slots).toHaveLength(6);
    expect(slots[0]!.end - slots[0]!.start).toBe(30 * 60_000);
    expect(new Date(slots[0]!.start).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })).toBe('9:00 AM');
  });
  it('end to end with the engine: marks buttons and never touches Next', () => {
    const doc = page('https://calendly.com/x/y?date=2026-11-10');
    const slots = calendly.readVisibleSlots(doc).map((s) => ({ ...s })); // browser zone assumed = TZ in CI below
    const busy = [block('2026-11-10', '10:30am', '11:00am'), block('2026-11-10', '12:30pm', '12:50pm')];
    const r = rankSlots(slots, busy, defaultSettings(TZ), { now: at('2026-11-04', '12:00pm') });
    for (const k of r.kept) markSlot(k.slot.el as HTMLElement, { state: k.verdict, reason: k.primary });
    for (const h of r.hidden) markSlot(h.slot.el as HTMLElement, { state: 'hidden', reason: h.reason });
    const marked = [...doc.querySelectorAll<HTMLElement>('[data-fmt-verdict]')].map((e) => `${e.textContent}=${e.dataset.fmtVerdict}`);
    expect(marked).toHaveLength(6);
    expect(marked).toContain('11:00am=hidden');
    expect(marked).toContain('12:35pm=hidden');
    expect(doc.querySelector<HTMLElement>('button:not([data-container])')?.dataset.fmtVerdict).toBeUndefined();
  });
});
