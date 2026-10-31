// Ranking engine (filters → score → reasons) is built in step 3.
// This one helper exists so the test runner has something real to check.
import type { Interval } from './types';

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}
