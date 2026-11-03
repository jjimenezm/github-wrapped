import type { CardStyle, WrapSnapshot } from '@wrapped/shared';
import {
  ANIMATION_CSS,
  ART_HEIGHT,
  ART_WIDTH,
  artScope,
  type ArtOptions,
  type ArtScope,
} from './art-context';
import { constelacionMarkup } from './constelacion';
import { cordilleraMarkup } from './cordillera';
import { huellaMarkup } from './huella';

const MARKUP: Record<CardStyle, (scope: ArtScope) => string> = {
  huella: huellaMarkup,
  cordillera: cordilleraMarkup,
  constelacion: constelacionMarkup,
};

/** The art's inner markup, in the 300×168 box, for embedding in a larger SVG. */
export function artMarkup(style: CardStyle, snapshot: WrapSnapshot, options: ArtOptions): string {
  return MARKUP[style](artScope(style, snapshot, options));
}

/** One art piece as a standalone SVG: same snapshot and options, same bytes. */
export function renderArt(style: CardStyle, snapshot: WrapSnapshot, options: ArtOptions): string {
  const css = options.animated ? `<style>${ANIMATION_CSS}</style>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ART_WIDTH} ${ART_HEIGHT}">` +
    `${css}${artMarkup(style, snapshot, options)}</svg>`
  );
}
