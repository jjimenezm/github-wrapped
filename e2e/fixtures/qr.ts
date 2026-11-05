import jsQR from 'jsqr';
import { PNG } from 'pngjs';

/** What a phone camera would read from a screenshot: the QR's text, or null if none is legible. */
export function readQr(screenshot: Buffer): string | null {
  const { data, width, height } = PNG.sync.read(screenshot);
  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
  return jsQR(pixels, width, height)?.data ?? null;
}
