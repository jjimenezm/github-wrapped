import { formatNumber, type Locale, type WrapSnapshot } from '@wrapped/shared';
import { ART_HEIGHT, ART_WIDTH, artScope, weeklySeries, type ArtScope } from './art-context';
import { INK } from './colors';
import { escapeXml, MONO, MONO_ADVANCE, num } from './svg';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Star {
  x: number;
  y: number;
  r: number;
  color: string;
  /** The featured repo this star stands for; null for the smaller month stars. */
  repo: string | null;
}

export interface Dust {
  x: number;
  y: number;
  r: number;
  opacity: number;
  delay: number;
}

export interface StarLabel {
  /** The repo name, shortened with an ellipsis when it is too long. */
  name: string;
  /** Commits in the period, formatted for the locale. */
  count: string;
  x: number;
  y: number;
  anchor: 'start' | 'end' | 'middle';
  /** Collision box of the rendered text, in art coordinates. */
  box: Box;
}

export interface ConstelacionLayout {
  dust: Dust[];
  stars: Star[];
  labels: StarLabel[];
}

const DUST = 55;
const DUST_EMPTY_SKY = 110;
const NAMED_LABELS = 2;
const MAX_NAME = 22;
const SHORT_NAME = 12;
const FONT = 8.5;
const MARGIN = 2;

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const inside = (box: Box) =>
  box.x >= MARGIN &&
  box.y >= MARGIN &&
  box.x + box.width <= ART_WIDTH - MARGIN &&
  box.y + box.height <= ART_HEIGHT - MARGIN;

const starBox = (s: Star): Box => ({ x: s.x - s.r, y: s.y - s.r, width: s.r * 2, height: s.r * 2 });

const truncate = (name: string, max: number) =>
  [...name].length > max ? `${[...name].slice(0, max - 1).join('')}…` : name;

/** Seeded rejection sampling: tries a few spots and keeps the first that is far enough. */
function place(random: () => number, taken: readonly Star[], minDistance: number) {
  let best = { x: 0, y: 0, distance: -1 };
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = 34 + random() * (ART_WIDTH - 68);
    const y = 22 + random() * (ART_HEIGHT - 44);
    const distance = Math.min(Infinity, ...taken.map((s) => Math.hypot(s.x - x, s.y - y)));
    if (distance > best.distance) best = { x, y, distance };
    if (distance >= minDistance) break;
  }
  return { x: best.x, y: best.y };
}

/** Contributions per month of the period, from the weekly series. */
function monthlyTotals(snapshot: WrapSnapshot): number[] {
  const weeks = snapshot.weekly.length ? weeklySeries(snapshot) : [];
  const months = Math.max(1, Math.round(weeks.length / 4.35));
  const totals = Array<number>(months).fill(0);
  weeks.forEach((v, i) => {
    const month = Math.min(months - 1, Math.floor((i / weeks.length) * months));
    totals[month] = (totals[month] ?? 0) + v;
  });
  return totals;
}

/**
 * Tries label spots around the star (right, left, above, below, then nudged) and keeps the first
 * that stays in the box and clears every other label and named star.
 */
function placeLabel(star: Star, name: string, count: string, taken: Box[], stars: Star[]) {
  const width = `${name} ${count}`.length * FONT * MONO_ADVANCE;
  const gap = star.r + 6;
  const candidates: Array<{ x: number; y: number; anchor: StarLabel['anchor'] }> = [
    { x: star.x + gap, y: star.y + 3, anchor: 'start' },
    { x: star.x - gap, y: star.y + 3, anchor: 'end' },
    { x: star.x, y: star.y - gap, anchor: 'middle' },
    { x: star.x, y: star.y + gap + FONT, anchor: 'middle' },
    { x: star.x + gap, y: star.y - 9, anchor: 'start' },
    { x: star.x + gap, y: star.y + 15, anchor: 'start' },
    { x: star.x - gap, y: star.y - 9, anchor: 'end' },
    { x: star.x - gap, y: star.y + 15, anchor: 'end' },
  ];
  const obstacles = [...taken, ...stars.filter((s) => s !== star).map(starBox)];
  for (const spot of candidates) {
    const left =
      spot.anchor === 'start'
        ? spot.x
        : spot.anchor === 'end'
          ? spot.x - width
          : spot.x - width / 2;
    const box = { x: left, y: spot.y - FONT * 0.8, width, height: FONT };
    if (inside(box) && obstacles.every((o) => !overlaps(box, o))) {
      return { name, count, ...spot, box };
    }
  }
  return null;
}

/**
 * Where everything goes in the Constelación, without drawing it: each featured repo is a star
 * (size = commits, color = its language), each month with activity is a fainter star, and the two
 * most active repos get a name that never collides with another label.
 */
export function layoutConstelacion(snapshot: WrapSnapshot, locale: Locale): ConstelacionLayout {
  return layout(artScope('constelacion', snapshot, { locale }));
}

function layout(scope: ArtScope): ConstelacionLayout {
  const { snapshot, palette, random, locale } = scope;

  const topLanguages = [...snapshot.languages]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 3)
    .map((l) => l.name);
  const repos = [...snapshot.featured].sort((a, b) => b.commits - a.commits);
  const mostCommits = Math.max(1, ...repos.map((r) => r.commits));

  const stars: Star[] = [];
  repos.forEach((repo, i) => {
    const slot = topLanguages.indexOf(repo.languages[0] ?? '');
    stars.push({
      ...place(random, stars, 38),
      r: 2 + Math.sqrt(Math.max(0, repo.commits) / mostCommits) * 6,
      color: palette[slot >= 0 ? slot : i % 3] as string,
      repo: repo.name,
    });
  });

  const months = monthlyTotals(snapshot);
  const busiest = Math.max(...months);
  months.forEach((total, i) => {
    if (total <= 0 || busiest <= 0) return;
    stars.push({
      ...place(random, stars, 22),
      r: 0.9 + Math.sqrt(total / busiest) * 1.4,
      color: palette[(i + 1) % 3] as string,
      repo: null,
    });
  });

  // A sky with few stars gets more dust, so even an empty year is a full night.
  const dust: Dust[] = Array.from({ length: stars.length >= 3 ? DUST : DUST_EMPTY_SKY }, () => ({
    x: random() * ART_WIDTH,
    y: random() * ART_HEIGHT,
    r: 0.3 + random() * 0.6,
    opacity: 0.15 + random() * 0.4,
    delay: random() * 3000,
  }));

  const labels: StarLabel[] = [];
  for (const star of stars.filter((s) => s.repo !== null).slice(0, NAMED_LABELS)) {
    const repo = repos.find((r) => r.name === star.repo);
    const count = formatNumber(repo?.commits ?? 0, locale);
    const boxes = labels.map((l) => l.box);
    const label =
      placeLabel(star, truncate(star.repo ?? '', MAX_NAME), count, boxes, stars) ??
      placeLabel(star, truncate(star.repo ?? '', SHORT_NAME), count, boxes, stars);
    if (label) labels.push(label);
  }

  return { dust, stars, labels };
}

export function constelacionMarkup(scope: ArtScope): string {
  const { dust, stars, labels } = layout(scope);
  const { id, animate } = scope;

  let out = `<defs><filter id="${id('halo')}" x="-100%" y="-100%" width="300%" height="300%">`;
  out += `<feGaussianBlur stdDeviation="4"/></filter></defs>`;

  for (const d of dust) {
    out +=
      `<circle${animate('tw', d.delay)} cx="${num(d.x)}" cy="${num(d.y)}" r="${Math.round(d.r * 100) / 100}" ` +
      `fill="${INK.text}" opacity="${Math.round(d.opacity * 100) / 100}"/>`;
  }

  // Constellation lines run left to right through every star.
  const path = [...stars].sort((a, b) => a.x - b.x);
  for (let i = 0; i < path.length - 1; i++) {
    const [a, b] = [path[i] as Star, path[i + 1] as Star];
    out +=
      `<line${animate('draw', i * 160)} x1="${num(a.x)}" y1="${num(a.y)}" x2="${num(b.x)}" y2="${num(b.y)}" ` +
      `stroke="${INK.text}" stroke-opacity="0.22" stroke-width="0.7"/>`;
  }

  stars.forEach((s, i) => {
    const named = s.repo !== null;
    out +=
      `<g${animate('rise', 200 + i * 120)}>` +
      `<circle cx="${num(s.x)}" cy="${num(s.y)}" r="${num(s.r * 2.2)}" fill="${s.color}" ` +
      `opacity="${named ? 0.35 : 0.25}" filter="url(#${id('halo')})"/>` +
      `<circle cx="${num(s.x)}" cy="${num(s.y)}" r="${num(s.r)}" fill="${s.color}"/>` +
      (named
        ? `<circle cx="${num(s.x)}" cy="${num(s.y)}" r="${num(s.r * 0.35)}" fill="${INK.white}" opacity="0.85"/>`
        : '') +
      `</g>`;
  });

  labels.forEach((l, i) => {
    out +=
      `<text${animate('rise', 900 + i * 150)} x="${num(l.x)}" y="${num(l.y)}" text-anchor="${l.anchor}" ` +
      `font-family="${MONO}" font-size="${FONT}" fill="${INK.text}">${escapeXml(l.name)} ` +
      `<tspan fill="${INK.muted}">${l.count}</tspan></text>`;
  });

  return out;
}
