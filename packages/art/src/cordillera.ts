import { formatNumber } from '@wrapped/shared';
import { ART_HEIGHT, ART_WIDTH, movingAverage, weeklySeries, type ArtScope } from './art-context';
import { INK, lighten } from './colors';
import { MONO, MONO_ADVANCE, num } from './svg';

const BASELINE = 150;
const RELIEF = 112;
const TAU = Math.PI * 2;

type Point = readonly [number, number];

/** Catmull-Rom through the points, written as cubic Béziers. */
function smoothPath(points: readonly Point[]): string {
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))] as Point;
  let d = `M${num(at(0)[0])},${num(at(0)[1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d +=
      `C${num(p1[0] + (p2[0] - p0[0]) / 6)},${num(p1[1] + (p2[1] - p0[1]) / 6)} ` +
      `${num(p2[0] - (p3[0] - p1[0]) / 6)},${num(p2[1] - (p3[1] - p1[1]) / 6)} ` +
      `${num(p2[0])},${num(p2[1])}`;
  }
  return d;
}

const normalize = (values: number[]) => {
  const max = Math.max(...values);
  return values.map((v) => (max > 0 ? v / max : 0));
};

/**
 * Cordillera: the weeks as a mountain range in three layers. The front is the real weekly
 * contributions, lightly smoothed; the ranges behind are smoother still and swell with a seeded
 * slow wave, so the skyline is the person's year and also only theirs. The summit marks the best
 * week with its real number.
 */
export function cordilleraMarkup(scope: ArtScope): string {
  const { palette, random, id, animate, locale } = scope;
  const weeks = weeklySeries(scope.snapshot);
  const n = weeks.length;
  const x = (i: number) => (i / (n - 1)) * ART_WIDTH;

  const layers = [
    { window: 7, height: 0.55, opacity: 0.5, color: palette[2], offset: -26, wave: true },
    { window: 5, height: 0.78, opacity: 0.65, color: palette[1], offset: -12, wave: true },
    { window: 3, height: 1, opacity: 0.9, color: palette[0], offset: 0, wave: false },
  ];

  const best = Math.max(...weeks);
  // A year without contributions is a calm horizon, not three bright rails.
  const strength = best > 0 ? 1 : 0.4;
  let defs = '';
  let body = '';
  let front: number[] = [];
  layers.forEach((layer, j) => {
    const cycles = 1 + random() * 2;
    const phase = random() * TAU;
    const smoothed = movingAverage(weeks, layer.window).map((v, i) =>
      layer.wave ? v * (1 + 0.18 * Math.sin((TAU * cycles * i) / n + phase)) : v,
    );
    const heights = normalize(smoothed);
    if (!layer.wave) front = heights;
    const y = (i: number) => BASELINE + layer.offset - (heights[i] ?? 0) * RELIEF * layer.height;
    const d = smoothPath(heights.map((_, i) => [x(i), y(i)] as const));
    const gradient = id(`fill${j}`);
    defs +=
      // In art coordinates, not per layer: low relief gets a faint fill, a flat year almost none.
      `<linearGradient id="${gradient}" gradientUnits="userSpaceOnUse" x1="0" y1="${BASELINE - RELIEF}" x2="0" y2="${ART_HEIGHT}">` +
      `<stop offset="0" stop-color="${lighten(layer.color, 0.3)}" stop-opacity="${num(layer.opacity * 0.55)}"/>` +
      `<stop offset="1" stop-color="${layer.color}" stop-opacity="0"/></linearGradient>`;
    body +=
      `<g${animate('rise', j * 180)}>` +
      `<path d="${d}L${ART_WIDTH},${ART_HEIGHT}L0,${ART_HEIGHT}Z" fill="url(#${gradient})"/>` +
      `<path d="${d}" fill="none" stroke="${lighten(layer.color, 0.55)}" ` +
      `stroke-opacity="${num(layer.opacity * strength)}" stroke-width="${j === 2 ? 1.3 : 0.9}"/></g>`;
  });

  if (best > 0) {
    const week = weeks.indexOf(best);
    const px = x(week);
    const py = BASELINE - (front[week] ?? 0) * RELIEF;
    const count = formatNumber(best, locale);
    const label =
      locale === 'es'
        ? `sem. ${week + 1} · ${count} contrib.`
        : `wk ${week + 1} · ${count} contrib.`;
    const half = (label.length * 8.5 * MONO_ADVANCE) / 2 + 8;
    const lx = Math.min(Math.max(px, half), ART_WIDTH - half);
    body +=
      `<g${animate('rise', 700)}>` +
      `<circle cx="${num(px)}" cy="${num(py)}" r="2.6" fill="${INK.text}"/>` +
      `<line x1="${num(px)}" y1="${num(py - 4)}" x2="${num(px)}" y2="${num(py - 14)}" ` +
      `stroke="${INK.text}" stroke-opacity="0.5"/>` +
      `<text x="${num(lx)}" y="${num(py - 18)}" text-anchor="middle" font-family="${MONO}" ` +
      `font-size="8.5" fill="${INK.text}">${label}</text></g>`;
  }

  return `<defs>${defs}</defs>${body}`;
}
