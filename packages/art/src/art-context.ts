import type { CardStyle, Locale, WrapSnapshot } from '@wrapped/shared';
import { artPalette, type Palette } from './colors';
import { createRng, deriveSeed, seedFor } from './rng';

/** Every art piece draws in this box; the card scales it into place. */
export const ART_WIDTH = 300;
export const ART_HEIGHT = 168;

export interface ArtOptions {
  locale: Locale;
  /** Adds the optional entrance-animation classes the web uses; PNGs leave them out. */
  animated?: boolean;
}

export type EntranceAnimation = 'draw' | 'rise' | 'tw';

/** What one art piece needs to draw: the person's data, their seed and palette, and helpers. */
export interface ArtScope {
  snapshot: WrapSnapshot;
  locale: Locale;
  palette: Palette;
  random: () => number;
  /** Ids are global in an HTML page, and the carousel shows three cards at once. */
  id: (name: string) => string;
  /** Animation attributes for an element, or nothing for a static render. */
  animate: (kind: EntranceAnimation, delayMs: number) => string;
}

export function artScope(style: CardStyle, snapshot: WrapSnapshot, options: ArtOptions): ArtScope {
  const seed = seedFor(snapshot.githubUserId, snapshot.period.year);
  const suffix = seed.toString(36);
  return {
    snapshot,
    locale: options.locale,
    palette: artPalette(snapshot.languages),
    random: createRng(deriveSeed(seed, style)),
    id: (name) => `gw-${style}-${name}-${suffix}`,
    animate: (kind, delayMs) =>
      options.animated
        ? ` class="gw-${kind}" style="animation-delay:${Math.round(delayMs)}ms"${kind === 'draw' ? ' pathLength="1"' : ''}`
        : '',
  };
}

/** Weekly contributions with at least two points, so every curve has a start and an end. */
export function weeklySeries(snapshot: WrapSnapshot): number[] {
  const weeks = snapshot.weekly.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  if (weeks.length === 0) return [0, 0];
  if (weeks.length === 1) return [weeks[0] as number, weeks[0] as number];
  return weeks;
}

/** Centered moving average; the window shrinks at the edges instead of inventing values. */
export function movingAverage(values: readonly number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - half), i + half + 1);
    return slice.reduce((sum, v) => sum + v, 0) / slice.length;
  });
}

/** Entrance animations, scoped by class prefix and skipped for people who prefer less motion. */
export const ANIMATION_CSS =
  '@media (prefers-reduced-motion:no-preference){' +
  '.gw-draw{stroke-dasharray:1;stroke-dashoffset:1;animation:gw-draw 2.4s cubic-bezier(.16,1,.3,1) forwards}' +
  '@keyframes gw-draw{to{stroke-dashoffset:0}}' +
  '.gw-rise{opacity:0;animation:gw-rise 1.6s cubic-bezier(.16,1,.3,1) forwards}' +
  '@keyframes gw-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}' +
  '.gw-tw{animation:gw-tw 3.2s ease-in-out infinite alternate}' +
  '@keyframes gw-tw{from{opacity:.35}to{opacity:1}}}';
