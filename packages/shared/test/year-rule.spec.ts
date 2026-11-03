import { isRegenerable, previousYearPeriod, resolveWrapPeriod } from '../src';

const at = (iso: string) => new Date(iso);

describe('resolveWrapPeriod', () => {
  it('covers the current year up to today from February to December', () => {
    expect(resolveWrapPeriod(at('2026-02-15T12:00:00Z'))).toEqual({
      year: 2026,
      from: '2026-01-01',
      to: '2026-02-15',
      complete: false,
    });
  });

  it('covers the whole previous year during January', () => {
    expect(resolveWrapPeriod(at('2027-01-05T09:00:00Z'))).toEqual({
      year: 2026,
      from: '2026-01-01',
      to: '2026-12-31',
      complete: true,
    });
  });

  it('switches to the new year on February 1st (UTC)', () => {
    expect(resolveWrapPeriod(at('2027-01-31T23:59:59Z')).year).toBe(2026);
    expect(resolveWrapPeriod(at('2027-02-01T00:00:00Z'))).toEqual({
      year: 2027,
      from: '2027-01-01',
      to: '2027-02-01',
      complete: false,
    });
  });

  it('treats December 31st as the current year, not yet complete', () => {
    expect(resolveWrapPeriod(at('2026-12-31T10:00:00Z'))).toEqual({
      year: 2026,
      from: '2026-01-01',
      to: '2026-12-31',
      complete: false,
    });
  });

  it('handles leap days', () => {
    expect(resolveWrapPeriod(at('2028-02-29T08:00:00Z')).to).toBe('2028-02-29');
  });

  it('uses the UTC date, not the local one', () => {
    // 23:30 in Santiago (UTC-5 in this example) is already the 16th in UTC.
    expect(resolveWrapPeriod(at('2026-02-15T23:30:00-05:00')).to).toBe('2026-02-16');
  });
});

describe('previousYearPeriod', () => {
  it('returns the same span one year earlier', () => {
    expect(previousYearPeriod(resolveWrapPeriod(at('2026-02-15T12:00:00Z')))).toEqual({
      from: '2025-01-01',
      to: '2025-02-15',
    });
  });

  it('returns the whole previous year for a complete period', () => {
    expect(previousYearPeriod(resolveWrapPeriod(at('2027-01-05T09:00:00Z')))).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
  });

  it('maps February 29th to February 28th', () => {
    expect(previousYearPeriod(resolveWrapPeriod(at('2028-02-29T08:00:00Z'))).to).toBe('2027-02-28');
  });
});

describe('isRegenerable', () => {
  it('allows regenerating a year until January 31st of the next year (UTC)', () => {
    expect(isRegenerable(2026, at('2026-11-03T12:00:00Z'))).toBe(true);
    expect(isRegenerable(2026, at('2027-01-31T23:59:59Z'))).toBe(true);
  });

  it('freezes a year from February 1st of the next year', () => {
    expect(isRegenerable(2026, at('2027-02-01T00:00:00Z'))).toBe(false);
    expect(isRegenerable(2027, at('2027-02-01T00:00:00Z'))).toBe(true);
  });
});
