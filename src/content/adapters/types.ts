// SiteAdapter contract from spec §2.3.
import type { Slot, Verdict } from '../../engine/types';

export interface SiteAdapter {
  id: 'calendly' | 'goodtime' | string;
  matches(url: URL, doc: Document): boolean;
  mode(doc: Document): 'slot-picker' | 'availability-request';
  readTimeZone(doc: Document): string;
  readVisibleSlots(doc: Document): Slot[];
  observe(onChange: () => void): () => void;
  annotate(slot: Slot, verdict: Verdict): void;
}
