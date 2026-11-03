import { CARD_STYLES, type CardStyle } from '@wrapped/shared';
import { artPalette, FALLBACK_PALETTE, INK, renderArt } from '../src';
import { language, makeSnapshot } from './fixtures';
import { hueAndSaturation, paintedColors, parseColor, renderSize } from './helpers';

const draw = (style: CardStyle, overrides = {}) =>
  renderArt(style, makeSnapshot(overrides), { locale: 'es' });

const expectClean = (svg: string) => {
  expect(svg).not.toMatch(/NaN|undefined|null|Infinity/);
  expect(() => renderSize(svg)).not.toThrow();
};

describe.each(CARD_STYLES)('renderArt(%s)', (style) => {
  it('is a standalone SVG in the 300×168 art box', () => {
    const svg = draw(style);
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]* viewBox="0 0 300 168"/,
    );
    expect(svg.endsWith('</svg>')).toBe(true);
    expectClean(svg);
  });

  it('draws the same SVG byte for byte for the same snapshot', () => {
    const runs = [1, 2, 3].map(() => draw(style));
    expect(runs[1]).toBe(runs[0]);
    expect(runs[2]).toBe(runs[0]);
  });

  it('draws a different SVG for another person with the same numbers', () => {
    expect(draw(style, { githubUserId: 583232, login: 'otra-persona' })).not.toBe(draw(style));
  });

  it('draws a different SVG for the same person in another year', () => {
    const period = { year: 2025, from: '2025-01-01', to: '2025-11-03', complete: false };
    expect(draw(style, { period })).not.toBe(draw(style));
  });

  it('draws with the neutral palette when there are no languages', () => {
    const svg = draw(style, { languages: [] });
    expectClean(svg);
    expect(svg).toContain(FALLBACK_PALETTE[0]);
  });

  it('uses the fallback color for a language without color', () => {
    const svg = draw(style, { languages: [language('Nix', null, 10)] });
    expectClean(svg);
    expect(svg).toContain(FALLBACK_PALETTE[0]);
  });

  it('survives weeks that are all zero, a single week and no weeks', () => {
    for (const weekly of [Array(44).fill(0), [12], []]) {
      expectClean(draw(style, { weekly }));
    }
  });

  it('survives a person with no featured repos and no metrics', () => {
    const metrics = {
      contributions: null,
      commits: null,
      mergedPRs: null,
      reviews: null,
      issues: null,
    };
    expectClean(
      draw(style, { featured: [], metrics, activeDays: null, previousContributions: null }),
    );
  });

  it('keeps its gradient and filter ids unique per person and style', () => {
    const ids = [...draw(style).matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    const other = [...draw(style, { githubUserId: 9 }).matchAll(/\bid="([^"]+)"/g)].map(
      (m) => m[1],
    );
    for (const id of ids) {
      expect(id).toContain(style);
      expect(other).not.toContain(id);
    }
  });

  it('adds entrance animation classes only when asked', () => {
    expect(draw(style)).not.toContain('class=');
    expect(renderArt(style, makeSnapshot(), { locale: 'es', animated: true })).toMatch(
      /class="gw-(draw|rise|tw)"/,
    );
  });
});

describe.each(['huella', 'cordillera'] as const)('renderArt(%s) with one language', (style) => {
  it('paints only variations of that language color (besides the neutral ink)', () => {
    const svg = draw(style, { languages: [language('TypeScript', '#3178c6', 100)] });
    const reference = hueAndSaturation(parseColor(artPalette([language('TS', '#3178c6', 1)])[0])!);
    const ink: string[] = Object.values(INK);
    const tinted = paintedColors(svg)
      .filter((c) => !ink.includes(c))
      .map((c) => parseColor(c))
      .filter((rgb) => rgb !== null)
      .map((rgb) => hueAndSaturation(rgb))
      .filter(({ saturation }) => saturation > 0.2);
    expect(tinted.length).toBeGreaterThan(0);
    for (const { hue } of tinted) {
      expect(Math.abs(hue - reference.hue)).toBeLessThan(3);
    }
  });
});
