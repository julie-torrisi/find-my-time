// Busy intervals cached in chrome.storage.session (memory only, cleared when the browser closes). 15-min TTL.
import type { Interval } from '../engine/types';

const KEY = 'busyCache';
export const TTL_MS = 15 * 60_000;

export interface BusyCache {
  busy: Interval[];
  fetchedAt: number;
  range: { start: number; end: number };
}

export async function readBusyCache(): Promise<BusyCache | null> {
  const got = await chrome.storage.session.get(KEY);
  const c = got[KEY] as BusyCache | undefined;
  return c && Date.now() - c.fetchedAt < TTL_MS ? c : null;
}

export async function writeBusyCache(c: BusyCache): Promise<void> {
  await chrome.storage.session.set({ [KEY]: c });
}

export async function clearBusyCache(): Promise<void> {
  await chrome.storage.session.remove(KEY);
}
