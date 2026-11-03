import { movingAverage, weeklySeries, type ArtScope } from './art-context';
import { blend } from './colors';
import { num } from './svg';

const RINGS = 19;
const STEPS = 120;
const TAU = Math.PI * 2;
const CENTER_X = 150;
const CENTER_Y = 84;

/**
 * Huella: concentric rings like a fingerprint. Each ring bulges where the year was busy (the angle
 * walks through the weeks) and opens a gap at a seeded angle, so no two people share a print.
 */
export function huellaMarkup(scope: ArtScope): string {
  const { palette, random, id, animate } = scope;
  const weeks = movingAverage(weeklySeries(scope.snapshot), 3);
  const peak = Math.max(...weeks);
  // Interpolated between neighboring weeks (wrapping around), so rings bend instead of stepping.
  const activity = (angle: number) => {
    const position = ((((angle % TAU) + TAU) % TAU) / TAU) * weeks.length;
    const index = Math.floor(position) % weeks.length;
    const a = weeks[index] ?? 0;
    const b = weeks[(index + 1) % weeks.length] ?? 0;
    const week = a + (b - a) * (position - Math.floor(position));
    return peak > 0 ? week / peak : 0;
  };
  // Inner rings take the third language, outer rings the first: the main language frames the print.
  const colors = [...palette].reverse();

  let rings = '';
  for (let i = 0; i < RINGS; i++) {
    const t = i / (RINGS - 1);
    const radius = 5 + i * 4;
    const start = random() * TAU;
    const gap = 0.3 + random() * 0.6;
    let d = '';
    for (let step = 0; step <= STEPS; step++) {
      const angle = start + (step / STEPS) * (TAU - gap);
      const r = radius * (1 + 0.2 * t * activity(angle)) + Math.sin(angle * 3 + i * 0.7) * 0.9 * t;
      const x = CENTER_X + Math.cos(angle) * r * 1.45;
      const y = CENTER_Y + Math.sin(angle) * r * 0.9;
      d += `${step ? 'L' : 'M'}${num(x)},${num(y)}`;
    }
    rings +=
      `<path${animate('draw', i * 45)} d="${d}" fill="none" stroke="${blend(colors, t)}" ` +
      `stroke-opacity="${num(0.35 + 0.6 * t)}" stroke-width="1.05" stroke-linecap="round"/>`;
  }

  // The glow reuses the rings instead of drawing them twice.
  return (
    `<defs><filter id="${id('glow')}" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feGaussianBlur stdDeviation="2.4"/></filter></defs>` +
    `<use href="#${id('rings')}" filter="url(#${id('glow')})" opacity="0.45"/>` +
    `<g id="${id('rings')}">${rings}</g>`
  );
}
