// Service worker: calendar fetch, busy cache, messaging.
import { fetchIcsBusy, maskIcsUrl } from './sources/ics';
import { clearBusyCache, readBusyCache, writeBusyCache, type BusyCache } from './busy-cache';

const WINDOW_DAYS = 14;
const userTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

async function getIcsUrl(): Promise<string | undefined> {
  const { icsUrl } = await chrome.storage.local.get('icsUrl');
  return typeof icsUrl === 'string' ? icsUrl : undefined;
}

async function loadBusy(force: boolean): Promise<BusyCache> {
  if (!force) {
    const cached = await readBusyCache();
    if (cached) return cached;
  }
  const url = await getIcsUrl();
  if (!url) throw new Error('No calendar connected yet.');
  const start = Date.now();
  const range = { start, end: start + WINDOW_DAYS * 86_400_000 };
  const busy = await fetchIcsBusy(url, range, userTz());
  const cache = { busy, fetchedAt: Date.now(), range };
  await writeBusyCache(cache);
  return cache;
}

type Msg = { type: 'ping' } | { type: 'ics:status' } | { type: 'busy:get'; force?: boolean } | { type: 'ics:removed' };

chrome.runtime.onMessage.addListener((message: Msg, _sender, sendResponse) => {
  const reply = (p: Promise<unknown>) => {
    p.then((data) => sendResponse({ ok: true, data }), (e: unknown) =>
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true; // async response
  };
  switch (message?.type) {
    case 'ping':
      sendResponse({ type: 'pong' });
      return false;
    case 'ics:status':
      return reply(getIcsUrl().then((u) => ({ connected: !!u, masked: u ? maskIcsUrl(u) : null, timeZone: userTz() })));
    case 'busy:get':
      return reply(loadBusy(!!message.force));
    case 'ics:removed':
      return reply(clearBusyCache());
    default:
      return false;
  }
});
