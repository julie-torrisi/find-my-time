// Calendly adapter. Reads only what's rendered on screen: the selected date and the time buttons.
// Never clicks a time, "Next" or "Confirm".
// ⚠️ Built without real saved pages: date comes from the ?date= URL param, else the visible date heading.
import type { Slot, Verdict } from '../../engine/types';
import { zonedToUtc } from '../../engine/time';
import type { SiteAdapter } from './types';
import { parseDateHeading, parseDuration, parseTimeText } from '../read-times';

const MIN = 60_000;

function browserTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function readSelectedDate(doc: Document, url: URL, now = new Date()): string | null {
  const param = url.searchParams.get('date');
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) return param;
  const candidates = doc.querySelectorAll('h1, h2, h3, h4, [role="heading"], [data-container="selected-date"]');
  for (const el of candidates) {
    const d = parseDateHeading(el.textContent ?? '', now);
    if (d) return d;
  }
  return null;
}

export function readDurationMin(doc: Document): number {
  const scope = doc.querySelector('[data-container="details"], [data-component="event-type-details"], main') ?? doc.body;
  return parseDuration(scope?.textContent ?? '') ?? 30;
}

export function findTimeButtons(doc: Document): { el: HTMLElement; minutes: number }[] {
  const out: { el: HTMLElement; minutes: number }[] = [];
  for (const el of doc.querySelectorAll<HTMLElement>('button, [role="button"]')) {
    const minutes = parseTimeText(el.textContent ?? '');
    if (minutes !== null) out.push({ el, minutes });
  }
  return out;
}

export const calendly: SiteAdapter = {
  id: 'calendly',
  matches: (url) => /(^|\.)calendly\.com$/.test(url.hostname),
  mode: () => 'slot-picker',
  // Calendly shows times in the visitor's browser zone unless they change it. ⚠️ unchecked
  readTimeZone: () => browserTz(),
  readVisibleSlots(doc) {
    const date = readSelectedDate(doc, new URL(doc.location?.href ?? 'https://calendly.com/'));
    if (!date) return [];
    const tz = this.readTimeZone(doc);
    const dur = readDurationMin(doc) * MIN;
    return findTimeButtons(doc).map(({ el, minutes }): Slot => {
      const start = zonedToUtc(date, minutes, tz);
      return { start, end: start + dur, el };
    });
  },
  observe(onChange) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const mo = new MutationObserver((records) => {
      if (records.every((r) => (r.target as Element).closest?.('[data-find-my-time]'))) return;
      clearTimeout(timer);
      timer = setTimeout(onChange, 400);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    let lastUrl = location.href;
    const poll = setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        onChange();
      }
    }, 500);
    return () => {
      mo.disconnect();
      clearInterval(poll);
    };
  },
  annotate(slot, verdict) {
    markSlot(slot.el as HTMLElement | undefined, verdict);
  },
};

// Debug marking: plain outlines + hover reason. Styled later with the Cadence kit.
const OUTLINE: Record<Verdict['state'], string> = {
  best: '3px solid #1a7f37',
  fits: '2px solid #8c959f',
  tight: '2px dashed #bf8700',
  hidden: '2px dashed #cf222e',
};

export function markSlot(el: HTMLElement | undefined, v: Verdict): void {
  if (!el) return;
  el.style.outline = OUTLINE[v.state];
  el.style.outlineOffset = '2px';
  el.style.opacity = v.state === 'hidden' ? '0.45' : '';
  if (v.reason) el.title = `find-my-time: ${v.reason}`;
  el.dataset.fmtVerdict = v.state;
}
