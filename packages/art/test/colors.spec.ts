import { artPalette, FALLBACK_PALETTE, liftForDark } from '../src';
import { language } from './fixtures';
import { hueAndSaturation, parseColor, relativeLuminance } from './helpers';

const rgbOf = (color: string) => {
  const rgb = parseColor(color);
  if (!rgb) throw new Error(`not a color: ${color}`);
  return rgb;
};
const hueOf = (color: string) => hueAndSaturation(rgbOf(color)).hue;
/** Integer RGB channels shift the hue a little, more so in very light tints. */
const expectSameHue = (color: string, reference: string) =>
  expect(Math.abs(hueOf(color) - hueOf(reference))).toBeLessThan(3);

describe('liftForDark', () => {
  it('keeps the hue of the language color', () => {
    expectSameHue(liftForDark('#3178c6'), '#3178c6');
  });

  it('lifts dark colors until they read on the near-black card', () => {
    for (const dark of ['#555555', '#000080', '#00001a', '#000000']) {
      expect(relativeLuminance(rgbOf(liftForDark(dark)))).toBeGreaterThanOrEqual(0.2);
    }
  });

  it('returns lowercase #rrggbb', () => {
    expect(liftForDark('#4F5D95')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('artPalette', () => {
  it('uses the top three languages by bytes, lifted for the dark card', () => {
    const palette = artPalette([
      language('SCSS', '#c6538c', 10),
      language('TypeScript', '#3178c6', 50),
      language('PHP', '#4F5D95', 30),
      language('Shell', '#89e051', 1),
    ]);
    expect(palette).toEqual([
      liftForDark('#3178c6'),
      liftForDark('#4F5D95'),
      liftForDark('#c6538c'),
    ]);
  });

  it('turns a single language into three variations of its own color', () => {
    const palette = artPalette([language('Rust', '#dea584', 100)]);
    expect(new Set(palette).size).toBe(3);
    for (const color of palette) {
      expectSameHue(color, '#dea584');
    }
  });

  it('falls back to the neutral palette when there are no languages', () => {
    expect(artPalette([])).toEqual([...FALLBACK_PALETTE]);
  });

  it('uses the fallback color of that slot for a language without color', () => {
    const palette = artPalette([language('TypeScript', '#3178c6', 50), language('Nix', null, 20)]);
    expect(palette[0]).toBe(liftForDark('#3178c6'));
    expect(palette[1]).toBe(FALLBACK_PALETTE[1]);
  });

  it('never lets a malformed color reach the SVG', () => {
    const palette = artPalette([
      language('A', 'red" onload="x', 30),
      language('B', 'url(#x)', 20),
      language('C', '#12', 10),
    ]);
    expect(palette).toEqual([...FALLBACK_PALETTE]);
  });

  it('accepts the short #rgb form', () => {
    expect(artPalette([language('A', '#fa0', 1)])[0]).toBe(liftForDark('#ffaa00'));
  });
});
