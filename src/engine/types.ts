// Pure types shared by the engine and adapters. No browser APIs in engine/.
export interface Interval {
  start: number; // epoch ms, UTC
  end: number;
}

export interface Slot extends Interval {
  el?: Element; // DOM handle; set by adapters, ignored by the engine
}

export type VerdictState = 'best' | 'fits' | 'tight' | 'hidden';

export interface Verdict {
  state: VerdictState;
  reason?: string;
}
