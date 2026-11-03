import { movingAverage, renderArt } from '../src';
import { makeSnapshot } from './fixtures';

describe('movingAverage', () => {
  it('averages each value with its neighbors, shrinking the window at the edges', () => {
    expect(movingAverage([0, 0, 9, 0, 0], 3)).toEqual([0, 3, 3, 3, 0]);
  });

  it('leaves the series untouched with a window of 1', () => {
    expect(movingAverage([4, 1, 7], 1)).toEqual([4, 1, 7]);
  });

  it('handles an empty series', () => {
    expect(movingAverage([], 5)).toEqual([]);
  });
});

describe('cordillera', () => {
  const weekly = Array.from({ length: 44 }, (_, i) => (i === 36 ? 61 : 10 + (i % 5)));

  it('marks the best week with its real number', () => {
    expect(renderArt('cordillera', makeSnapshot({ weekly }), { locale: 'es' })).toContain(
      'sem. 37 · 61 contrib.',
    );
    expect(renderArt('cordillera', makeSnapshot({ weekly }), { locale: 'en' })).toContain(
      'wk 37 · 61 contrib.',
    );
  });

  it('formats the peak count for the locale', () => {
    const big = weekly.map((v, i) => (i === 36 ? 1024 : v));
    expect(renderArt('cordillera', makeSnapshot({ weekly: big }), { locale: 'es' })).toContain(
      '1.024 contrib.',
    );
  });

  it('stays flat and drops the peak label when every week is zero', () => {
    const svg = renderArt('cordillera', makeSnapshot({ weekly: Array(44).fill(0) }), {
      locale: 'es',
    });
    expect(svg).not.toContain('contrib.');
    expect(svg).not.toContain('NaN');
  });
});
