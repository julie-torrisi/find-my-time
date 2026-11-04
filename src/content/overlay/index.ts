// Plain debug panel in a closed Shadow DOM, so page CSS can't touch it and it can't touch the page.
import type { RankResult } from '../../engine';

export type PanelState =
  | { kind: 'hidden' }
  | { kind: 'message'; text: string }
  | { kind: 'result'; result: RankResult; tz: string; outOfRange: number };

export function createPanel() {
  const host = document.createElement('div');
  host.setAttribute('data-find-my-time', '');
  host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'closed' });
  const box = document.createElement('div');
  box.style.cssText = 'font:13px/1.4 system-ui,sans-serif;background:#fff;color:#111;border:1px solid #999;border-radius:6px;padding:10px 12px;max-width:340px;max-height:60vh;overflow:auto;box-shadow:0 2px 8px rgba(0,0,0,.2)';
  root.append(box);
  let collapsed = false;

  const el = (tag: string, text?: string, css?: string) => {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (css) e.style.cssText = css;
    return e;
  };

  function render(s: PanelState) {
    if (s.kind === 'hidden') {
      host.remove();
      return;
    }
    if (!host.isConnected) document.documentElement.append(host);
    const head = el('div', 'find-my-time', 'font-weight:600;cursor:pointer');
    head.addEventListener('click', () => {
      collapsed = !collapsed;
      render(s);
    });
    const children: HTMLElement[] = [head];
    if (!collapsed) {
      if (s.kind === 'message') children.push(el('div', s.text));
      else {
        const { result, tz } = s;
        const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        if (result.best.length) {
          children.push(el('div', 'Best for you', 'margin-top:6px;font-weight:600'));
          for (const b of result.best) {
            children.push(el('div', `${b.rank}. ${time.format(b.slot.start)}`, 'margin-top:4px'));
            children.push(el('div', b.primary + (b.secondary ? ` · ${b.secondary}` : ''), 'color:#444;margin-left:14px'));
          }
        } else {
          children.push(el('div', 'No good options on this day. Try another date.', 'margin-top:6px'));
        }
        const counts = `${result.kept.length} fit · ${result.hidden.length} hidden${s.outOfRange ? ` · ${s.outOfRange} beyond the 14 days checked` : ''}`;
        children.push(el('div', counts, 'margin-top:8px;color:#444'));
        if (result.hidden.length) {
          const det = el('details', undefined, 'margin-top:4px');
          det.append(el('summary', 'Why some times are hidden'));
          for (const h of result.hidden) det.append(el('div', `${time.format(h.slot.start)}: ${h.reason}`, 'color:#444'));
          children.push(det);
        }
        for (const w of result.warnings) children.push(el('div', w, 'margin-top:6px;color:#9a6700'));
        children.push(el('div', 'Suggestions only. You pick and book.', 'margin-top:8px;color:#666;font-size:12px'));
      }
    }
    box.replaceChildren(...children);
  }

  return { render };
}
