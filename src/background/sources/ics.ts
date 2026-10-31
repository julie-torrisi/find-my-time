// Fetch an ICS feed from the service worker. The URL is a secret: never log it.
import type { Interval } from '../../engine/types';
import { parseIcs, type IcsRange } from './ics-parse';

export function normalizeIcsUrl(raw: string): URL {
  const url = new URL(raw.trim().replace(/^webcals?:\/\//i, 'https://'));
  if (url.protocol !== 'https:') throw new Error('Calendar links must start with https:// or webcal://');
  return url;
}

/** "calendar.google.com/…••••" so the secret part is never shown */
export function maskIcsUrl(raw: string): string {
  try {
    const u = normalizeIcsUrl(raw);
    return `${u.host}/…••••`;
  } catch {
    return '••••';
  }
}

export async function fetchIcsBusy(raw: string, range: IcsRange, userTz: string): Promise<Interval[]> {
  const res = await fetch(normalizeIcsUrl(raw), { credentials: 'omit', cache: 'no-store', redirect: 'follow' });
  if (!res.ok) throw new Error(`Your calendar provider answered ${res.status}. Check the link is still valid.`);
  const text = await res.text();
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error("That link didn't return a calendar feed.");
  return parseIcs(text, range, userTz);
}
