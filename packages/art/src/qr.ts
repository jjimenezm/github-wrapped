import qrcode from 'qrcode-generator';
import { INK } from './colors';
import { num } from './svg';

/** The QR modules (true = dark) for a text, with medium error correction like the prototype. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => qr.isDark(row, col)),
  );
}

const QUIET_ZONE = 2;

/**
 * Dark modules on light paper inside a `size`-wide square. Modules are one path of horizontal
 * runs, so the rasterizer never leaves hairline seams between them.
 */
export function qrMarkup(text: string, x: number, y: number, size: number, radius: number): string {
  const matrix = qrMatrix(text);
  const modules = matrix.length + QUIET_ZONE * 2;
  let d = '';
  matrix.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      const start = c;
      while (row[c]) c++;
      d += `M${start + QUIET_ZONE},${r + QUIET_ZONE}h${c - start}v1h${start - c}z`;
    }
  });
  const scale = size / modules;
  return (
    `<rect x="${num(x)}" y="${num(y)}" width="${num(size)}" height="${num(size)}" rx="${radius}" fill="${INK.paper}"/>` +
    `<path transform="translate(${num(x)} ${num(y)}) scale(${scale.toFixed(4)})" d="${d}" ` +
    `fill="${INK.background}" shape-rendering="crispEdges"/>`
  );
}

/** Before publishing: light paper with a QR glyph, clearly a marker and not a code to scan. */
export function qrPlaceholderMarkup(x: number, y: number, size: number, radius: number): string {
  const icon = size * 0.5;
  const scale = icon / 24;
  const offset = (size - icon) / 2;
  return (
    `<rect x="${num(x)}" y="${num(y)}" width="${num(size)}" height="${num(size)}" rx="${radius}" fill="${INK.paper}" fill-opacity="0.92"/>` +
    `<g transform="translate(${num(x + offset)} ${num(y + offset)}) scale(${scale.toFixed(4)})" fill="none" ` +
    `stroke="${INK.muted}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">` +
    `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>` +
    `<rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/></g>`
  );
}
