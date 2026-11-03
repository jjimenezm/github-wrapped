import type { LanguageShare } from '@wrapped/shared';

/** The Frost UI ink: everything on the card that isn't a language color. */
export const INK = {
  background: '#0b0f14',
  surface: '#1c242c',
  text: '#e7ecf0',
  muted: '#8b97a3',
  positive: '#4ade80',
  paper: '#eef3f6',
  white: '#ffffff',
} as const;

/** Frost neutrals for people without languages, or with languages GitHub gives no color. */
export const FALLBACK_PALETTE = ['#a9bccb', '#7d93a8', '#d5dee6'] as const;

/** The three colors an art piece paints with, strongest first. */
export type Palette = readonly [string, string, string];

type Rgb = [number, number, number];

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Only `#rgb` / `#rrggbb` pass, so nothing but a color ever reaches an SVG attribute. */
function parseHex(color: string): Rgb | null {
  if (!HEX_COLOR.test(color)) return null;
  const digits = color.slice(1);
  const hex = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

const toHex = (rgb: Rgb) =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Mixing toward white keeps the hue: every channel moves the same fraction of its distance. */
const tint = (rgb: Rgb, amount: number): Rgb => rgb.map((v) => v + (255 - v) * amount) as Rgb;

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => {
    const c = Math.round(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const BASE_LIFT = 0.28;
const MIN_LUMINANCE = 0.2;

/**
 * GitHub's language colors are picked for white pages; this lifts them so they glow on the
 * near-black card, lifting dark ones (C's grey, deep blues) further until they read.
 */
export function liftForDark(color: string): string {
  const rgb = parseHex(color);
  if (!rgb) return FALLBACK_PALETTE[0];
  let amount = BASE_LIFT;
  while (luminance(tint(rgb, amount)) < MIN_LUMINANCE && amount < 1) {
    amount = Math.min(1, amount + 0.04);
  }
  return toHex(tint(rgb, amount));
}

/** A lighter tint of an already safe palette color. */
export function lighten(color: string, amount: number): string {
  const rgb = parseHex(color);
  return rgb ? toHex(tint(rgb, amount)) : color;
}

/** Linear blend across the palette (t from 0 to 1), as hex so it stays a plain attribute value. */
export function blend(colors: readonly string[], t: number): string {
  const rgbs = colors.map((c) => parseHex(c) ?? (parseHex(FALLBACK_PALETTE[0]) as Rgb));
  if (rgbs.length === 1) return toHex(rgbs[0] as Rgb);
  const span = rgbs.length - 1;
  const position = Math.min(1, Math.max(0, t)) * span;
  const index = Math.min(span - 1, Math.floor(position));
  const k = position - index;
  const a = rgbs[index] as Rgb;
  const b = rgbs[index + 1] as Rgb;
  return toHex(a.map((v, j) => v + ((b[j] as number) - v) * k) as Rgb);
}

/**
 * The top three languages by bytes, lifted for the dark card. A language without a usable color
 * takes the fallback color of its slot; missing slots become tints of the first color, so a
 * one-language person gets three variations of it. No languages at all → the neutral palette.
 */
export function artPalette(languages: readonly LanguageShare[]): Palette {
  if (languages.length === 0) return FALLBACK_PALETTE;
  const top = [...languages].sort((a, b) => b.bytes - a.bytes).slice(0, 3);
  const colors = top.map((language, slot) =>
    language.color && parseHex(language.color)
      ? liftForDark(language.color)
      : (FALLBACK_PALETTE[slot] as string),
  );
  const first = colors[0] as string;
  return [first, colors[1] ?? lighten(first, 0.3), colors[2] ?? lighten(first, 0.55)];
}
