import {
  formatNumber,
  periodChip,
  periodLabel,
  resolveWrapPeriod,
  shareText,
  yearOverYear,
} from '../src';

const ongoing = resolveWrapPeriod(new Date('2026-02-15T12:00:00Z'));
const complete = resolveWrapPeriod(new Date('2027-01-05T09:00:00Z'));

describe('formatNumber', () => {
  it('groups thousands with a dot in Spanish', () => {
    expect(formatNumber(1284, 'es')).toBe('1.284');
  });

  it('groups thousands with a comma in English', () => {
    expect(formatNumber(1284, 'en')).toBe('1,284');
  });

  it('leaves numbers under a thousand untouched', () => {
    expect(formatNumber(999, 'es')).toBe('999');
  });
});

describe('periodLabel', () => {
  it('says "up to <month>" while the year is ongoing', () => {
    expect(periodLabel(ongoing, 'es')).toBe('Hasta febrero de 2026');
    expect(periodLabel(ongoing, 'en')).toBe('Through February 2026');
  });

  it('says "all of <year>" for a complete year', () => {
    expect(periodLabel(complete, 'es')).toBe('Todo 2026');
    expect(periodLabel(complete, 'en')).toBe('All of 2026');
  });
});

describe('periodChip', () => {
  it('shows the month range with the year', () => {
    expect(periodChip(ongoing, 'es')).toBe('ene–feb 2026');
    expect(periodChip(ongoing, 'en')).toBe('Jan–Feb 2026');
  });

  it('spans January to December for a complete year', () => {
    expect(periodChip(complete, 'es')).toBe('ene–dic 2026');
    expect(periodChip(complete, 'en')).toBe('Jan–Dec 2026');
  });
});

describe('yearOverYear', () => {
  it('returns the rounded percentage change', () => {
    expect(yearOverYear(1284, 1044)).toBe(23);
  });

  it('returns a negative change when the year went down', () => {
    expect(yearOverYear(876, 952)).toBe(-8);
  });

  it('returns null instead of an infinite change when last year was zero', () => {
    expect(yearOverYear(100, 0)).toBeNull();
  });

  it('returns null when either side is unknown', () => {
    expect(yearOverYear(null, 5)).toBeNull();
    expect(yearOverYear(5, null)).toBeNull();
  });
});

describe('shareText', () => {
  const period = { year: 2026, from: '2026-01-01', to: '2026-11-03', complete: false };

  it('says how far the year goes and the contributions, in the wrap’s language', () => {
    expect(shareText({ period, metrics: { contributions: 1284 } }, 'es')).toBe(
      'Mi 2026 en GitHub, hasta noviembre: 1.284 contribuciones.',
    );
    expect(shareText({ period, metrics: { contributions: 1284 } }, 'en')).toBe(
      'My 2026 on GitHub through November: 1,284 contributions.',
    );
  });

  it('drops the month for a complete year', () => {
    const complete = { year: 2025, from: '2025-01-01', to: '2025-12-31', complete: true };

    expect(shareText({ period: complete, metrics: { contributions: 1 } }, 'es')).toBe(
      'Mi 2025 en GitHub: 1 contribución.',
    );
    expect(shareText({ period: complete, metrics: { contributions: 1 } }, 'en')).toBe(
      'My 2025 on GitHub: 1 contribution.',
    );
  });

  it('never makes up a number that failed to load', () => {
    expect(shareText({ period, metrics: { contributions: null } }, 'es')).toBe(
      'Mi 2026 en GitHub, hasta noviembre.',
    );
  });
});
