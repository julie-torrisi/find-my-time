import { describe, expect, it } from 'vitest';
import { overlaps } from './index';

const h = (n: number) => n * 3_600_000;

describe('overlaps', () => {
  it('detects overlap', () => expect(overlaps({ start: h(1), end: h(3) }, { start: h(2), end: h(4) })).toBe(true));
  it('treats touching edges as free', () => expect(overlaps({ start: h(1), end: h(2) }, { start: h(2), end: h(3) })).toBe(false));
});
