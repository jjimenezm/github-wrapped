/** Escapes text and attribute values; logins and repo names end up inside the web's DOM. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** One decimal is plenty at these scales and keeps the SVG small; never prints `-0`. */
export function num(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(rounded === 0 ? 0 : rounded);
}

export const SANS = "'Geist', sans-serif";
export const MONO = "'Geist Mono', monospace";

/** Geist Mono advances every glyph by 0.6em, which makes monospaced labels measurable. */
export const MONO_ADVANCE = 0.6;

/**
 * Rough Geist advance widths (em) by glyph class. There is no DOM to measure text, so layout
 * decisions (truncating, dropping a segment) use this conservative estimate.
 */
function sansAdvance(char: string): number {
  if (/[ilj.,:;'!|]/.test(char)) return 0.28;
  if (/[ftr ()\-]/.test(char)) return 0.36;
  if (/[mwMW@%]/.test(char)) return 0.86;
  if (/[A-Z]/.test(char)) return 0.66;
  if (/[0-9]/.test(char)) return 0.6;
  return 0.56;
}

export function textWidth(text: string, fontSize: number, mono = false): number {
  const em = mono
    ? [...text].length * MONO_ADVANCE
    : [...text].reduce((sum, char) => sum + sansAdvance(char), 0);
  return em * fontSize;
}

/** Shortens text with an ellipsis until its estimated width fits. */
export function fitText(text: string, maxWidth: number, fontSize: number, mono = false): string {
  if (textWidth(text, fontSize, mono) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 1 && textWidth(`${chars.join('')}…`, fontSize, mono) > maxWidth) {
    chars.pop();
  }
  return `${chars.join('')}…`;
}
