import { Resvg } from '@resvg/resvg-js';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export type Rasterize = (svg: string) => Buffer;

/**
 * SVG to PNG with resvg and only the shipped fonts (no system fonts), so a card renders the same
 * on a laptop, in CI and in the container, without a browser.
 */
export function createRasterizer(fontsDir: string): Rasterize {
  const fontFiles = readdirSync(fontsDir)
    .filter((file) => file.endsWith('.ttf'))
    .map((file) => join(fontsDir, file));
  return (svg) =>
    new Resvg(svg, {
      font: { loadSystemFonts: false, fontFiles, defaultFontFamily: 'Geist' },
    })
      .render()
      .asPng();
}
