import { normalizeIcsUrl } from '../background/sources/ics';
import type { BusyCache } from '../background/busy-cache';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = (t: string) => ($('msg').textContent = t);

type Reply<T> = { ok: true; data: T } | { ok: false; error: string };
const send = <T>(m: object) => chrome.runtime.sendMessage(m) as Promise<Reply<T>>;

async function render() {
  const st = await send<{ connected: boolean; masked: string | null; timeZone: string }>({ type: 'ics:status' });
  if (!st.ok) return msg(st.error);
  $('connect').hidden = st.data.connected;
  $('connected').hidden = !st.data.connected;
  $('ics-masked').textContent = st.data.masked ?? '';
  $('busy').replaceChildren();
  $('fetched').textContent = '';
  if (st.data.connected) await showBusy(false, st.data.timeZone);
}

async function showBusy(force: boolean, tz: string) {
  msg('Checking your calendar…');
  const r = await send<BusyCache>({ type: 'busy:get', force });
  if (!r.ok) return msg(r.error);
  msg('');
  const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
  const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  const items = r.data.busy.map((b) => {
    const li = document.createElement('li');
    const long = b.end - b.start >= 86_400_000 - 3_600_000;
    li.textContent = long ? `${day.format(b.start)} · all day` : `${day.format(b.start)} · ${time.format(b.start)}–${time.format(b.end)}`;
    return li;
  });
  $('busy').replaceChildren(...items);
  $('fetched').textContent = `${items.length} busy blocks. Fetched ${time.format(r.data.fetchedAt)} (${tz}). Your provider may take a few hours to publish recent changes.`;
}

$('ics-save').addEventListener('click', async () => {
  const raw = $<HTMLInputElement>('ics-url').value;
  let url: URL;
  try {
    url = normalizeIcsUrl(raw);
  } catch (e) {
    return msg(e instanceof Error ? e.message : 'That doesn’t look like a link.');
  }
  // Ask for access to this one host only, from the click (Chrome requires a user gesture).
  const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
  if (!granted) return msg('find-my-time needs permission to read that calendar host. Nothing was saved.');
  await chrome.storage.local.set({ icsUrl: raw.trim() });
  $<HTMLInputElement>('ics-url').value = '';
  await render();
});

$('ics-refresh').addEventListener('click', async () => {
  const st = await send<{ timeZone: string }>({ type: 'ics:status' });
  if (st.ok) await showBusy(true, st.data.timeZone);
});

$('ics-remove').addEventListener('click', async () => {
  const { icsUrl } = await chrome.storage.local.get('icsUrl');
  if (typeof icsUrl === 'string') {
    try {
      await chrome.permissions.remove({ origins: [`${normalizeIcsUrl(icsUrl).origin}/*`] });
    } catch {
      /* permission may already be gone */
    }
  }
  await chrome.storage.local.remove('icsUrl');
  await send({ type: 'ics:removed' });
  msg('Feed removed and cached busy times cleared.');
  await render();
});

void render();
