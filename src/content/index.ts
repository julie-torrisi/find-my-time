// Injected only on supported booking hosts (see manifest). Suggests only: never clicks or books.
import { defaultSettings, rankSlots, type Settings } from '../engine';
import type { BusyCache } from '../background/busy-cache';
import { calendly } from './adapters/calendly';
import type { SiteAdapter } from './adapters/types';
import { createPanel } from './overlay';

const adapters: SiteAdapter[] = [calendly];
const adapter = adapters.find((a) => a.matches(new URL(location.href), document));

type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

async function loadSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...defaultSettings(Intl.DateTimeFormat().resolvedOptions().timeZone), ...(settings ?? {}) };
}

if (adapter) {
  const panel = createPanel();
  let busyRun = false;
  let again = false;

  const update = async () => {
    if (busyRun) {
      again = true;
      return;
    }
    busyRun = true;
    try {
      const slots = adapter.readVisibleSlots(document);
      if (!slots.length) {
        panel.render({ kind: 'hidden' });
        return;
      }
      const r = (await chrome.runtime.sendMessage({ type: 'busy:get' })) as Reply<BusyCache>;
      if (!r.ok) {
        panel.render({ kind: 'message', text: `${r.error} Open find-my-time settings to connect a calendar.` });
        return;
      }
      const settings = await loadSettings();
      const inRange = slots.filter((s) => s.end <= r.data.range.end);
      const result = rankSlots(inRange, r.data.busy, settings, { now: Date.now(), pageTimeZone: adapter.readTimeZone(document) });
      for (const k of result.kept) adapter.annotate(k.slot, { state: k.verdict, reason: k.primary });
      for (const h of result.hidden) adapter.annotate(h.slot, { state: 'hidden', reason: h.reason });
      panel.render({ kind: 'result', result, tz: settings.timeZone, outOfRange: slots.length - inRange.length });
    } catch (e) {
      panel.render({ kind: 'message', text: `Something went wrong reading this page: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      busyRun = false;
      if (again) {
        again = false;
        void update();
      }
    }
  };

  adapter.observe(() => void update());
  void update();
}
