import { createRng, seedFor } from '../src';

describe('seedFor', () => {
  it('is stable for the same GitHub id and year', () => {
    expect(seedFor(583231, 2026)).toBe(seedFor(583231, 2026));
  });

  it('changes with the GitHub id and with the year', () => {
    const seed = seedFor(583231, 2026);
    expect(seedFor(583232, 2026)).not.toBe(seed);
    expect(seedFor(583231, 2027)).not.toBe(seed);
  });

  it('is an unsigned 32-bit integer', () => {
    const seed = seedFor(1, 2026);
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });
});

describe('createRng', () => {
  it('replays the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const first = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(first);
  });

  it('returns numbers in [0, 1)', () => {
    const next = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('gives different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(Array.from({ length: 5 }, () => b()));
  });
});
