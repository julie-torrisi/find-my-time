// Helpers for reading times and dates from visible page text. Pure: no chrome APIs.

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "10:00am", "10:00 AM", "1pm", "14:30" → minutes after midnight, or null */
export function parseTimeText(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  let m = /^(\d{1,2})(?::(\d{2}))?\s?(am|pm|a\.m\.|p\.m\.)$/.exec(t);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (h < 1 || h > 12 || min > 59) return null;
    return ((h % 12) + (m[3]!.startsWith('p') ? 12 : 0)) * 60 + min;
  }
  m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    return h < 24 && min < 60 ? h * 60 + min : null;
  }
  return null;
}

/** "Wednesday, November 4" (+ optional year) → YYYY-MM-DD, picking the year closest to `now`. */
export function parseDateHeading(text: string, now: Date): string | null {
  const m = /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?/i.exec(text);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]!.toLowerCase());
  if (month < 0) return null;
  let year = m[3] ? Number(m[3]) : now.getFullYear();
  if (!m[3] && month < now.getMonth() - 2) year += 1; // e.g. "January 5" seen in December
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

/** "30 min", "1 hr", "1 hour 30 minutes" → minutes; null if none found */
export function parseDuration(text: string): number | null {
  const hr = /(\d+)\s*(?:hr|hrs|hour|hours)\b(?:\s*(\d+)\s*(?:min|mins|minutes)\b)?/i.exec(text);
  if (hr) return Number(hr[1]) * 60 + Number(hr[2] ?? 0);
  const min = /\b(\d{1,3})\s*(?:min|mins|minutes)\b/i.exec(text);
  return min ? Number(min[1]) : null;
}
