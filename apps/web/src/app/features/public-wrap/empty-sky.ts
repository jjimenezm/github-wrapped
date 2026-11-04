import { createRng } from '@wrapped/art';

/**
 * The sky of a page without a wrap: scattered stars and an empty orbit around one point, the
 * Constelación with no year in it. Seeded, so the server and the browser draw the same bytes.
 */
function emptySky(): string {
  const random = createRng(77);
  let stars = '';
  for (let i = 0; i < 70; i++) {
    const x = (random() * 360).toFixed(1);
    const y = (random() * 220).toFixed(1);
    const r = (0.4 + random() * 0.9).toFixed(2);
    const opacity = (0.12 + random() * 0.45).toFixed(2);
    const delay = (random() * 3).toFixed(2);
    stars += `<circle class="tw" style="animation-delay:${delay}s" cx="${x}" cy="${y}" r="${r}" fill="#e7ecf0" opacity="${opacity}"/>`;
  }
  return (
    '<svg viewBox="0 0 360 220" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
    stars +
    '<circle cx="180" cy="112" r="34" fill="none" stroke="rgba(231,236,240,.14)" stroke-dasharray="2 5"/>' +
    '<circle class="tw" cx="180" cy="112" r="3" fill="#b8d0dc"/>' +
    '</svg>'
  );
}

export const EMPTY_SKY_SVG = emptySky();
