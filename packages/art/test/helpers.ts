import { Resvg } from '@resvg/resvg-js';
import jsQR from 'jsqr';

/** Rasterizes an SVG the way the renderer will (resvg, no browser) and reads any QR code in it. */
export function decodeQr(svg: string): string | null {
  const image = new Resvg(svg, { font: { loadSystemFonts: false } }).render();
  const pixels = new Uint8ClampedArray(image.pixels);
  // dontInvert: a light-on-dark code must fail, the card promises dark modules on light paper.
  return jsQR(pixels, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

/** Throws when resvg can't parse the SVG, so it doubles as a well-formedness check. */
export function renderSize(svg: string): { width: number; height: number } {
  const image = new Resvg(svg, { font: { loadSystemFonts: false } }).render();
  return { width: image.width, height: image.height };
}

/** Rasterizes a module matrix with a 4-module quiet zone, independent of the SVG code under test. */
export function decodeMatrix(matrix: boolean[][], scale = 6): string | null {
  const n = matrix.length + 8;
  const size = n * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + 4) * scale + dy) * size + (x + 4) * scale + dx) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        }
      }
    }),
  );
  return jsQR(pixels, size, size, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseColor(value: string): Rgb | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex?.[1]) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const rgb = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(value.replace(/\s/g, ''));
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  return null;
}

export function hueAndSaturation({ r, g, b }: Rgb): { hue: number; saturation: number } {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (delta !== 0) {
    const [rn, gn, bn] = [r / 255, g / 255, b / 255];
    if (max === rn) hue = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) hue = 60 * ((bn - rn) / delta + 2);
    else hue = 60 * ((rn - gn) / delta + 4);
  }
  return { hue: (hue + 360) % 360, saturation };
}

/** Every color painted by fill, stroke or stop-color attributes. */
export function paintedColors(svg: string): string[] {
  return [...svg.matchAll(/(?:fill|stroke|stop-color)="([^"]+)"/g)]
    .map((m) => m[1] ?? '')
    .filter((c) => c !== 'none' && !c.startsWith('url('));
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
