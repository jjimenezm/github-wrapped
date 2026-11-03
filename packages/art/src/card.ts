import {
  formatNumber,
  periodChip,
  periodLabel,
  publicWrapUrl,
  yearOverYear,
  type CardStyle,
  type Locale,
  type WrapSnapshot,
} from '@wrapped/shared';
import { artMarkup } from './art';
import { ANIMATION_CSS, ART_HEIGHT, ART_WIDTH } from './art-context';
import { INK } from './colors';
import { qrMarkup, qrPlaceholderMarkup } from './qr';
import { seedFor } from './rng';
import { escapeXml, fitText, MONO, MONO_ADVANCE, num, SANS, textWidth } from './svg';

/** Pixel sizes of the two images: the 4:5 card and the link preview. */
export const CARD_SIZES = {
  portrait: { width: 1080, height: 1350 },
  landscape: { width: 1200, height: 630 },
} as const;

export type CardFormat = keyof typeof CARD_SIZES;

export interface CardOptions {
  style: CardStyle;
  locale: Locale;
  format: CardFormat;
  /** `PUBLIC_BASE_URL`; the QR and the printed link point to `<base>/@login/year`. */
  publicBaseUrl: string;
  /**
   * `placeholder` before publishing: an unscannable marker, so no screenshot of the carousel
   * shares a link to a page that doesn't exist yet. Defaults to `code`.
   */
  qr?: 'code' | 'placeholder';
  /** Adds the optional entrance animations the web uses. */
  animated?: boolean;
  /** The avatar as a data URI (the renderer fetches it); without it, the login's initial. */
  avatarHref?: string | null;
}

/** Layout units: the card is drawn in these and scaled to the pixel size (×3.6 and ×2). */
const VIEW: Record<CardFormat, { width: number; height: number }> = {
  portrait: { width: 300, height: 375 },
  landscape: { width: 600, height: 315 },
};

const COPY = {
  es: {
    contributions: (n: number) => (n === 1 ? 'contribución' : 'contribuciones'),
    activeDays: (n: number) => (n === 1 ? 'día activo' : 'días activos'),
    scan: 'Escanea mi año en GitHub',
    card: (login: string) => `Mi año en GitHub, @${login}`,
  },
  en: {
    contributions: (n: number) => (n === 1 ? 'contribution' : 'contributions'),
    activeDays: (n: number) => (n === 1 ? 'active day' : 'active days'),
    scan: 'Scan my year on GitHub',
    card: (login: string) => `My year on GitHub, @${login}`,
  },
} as const;

const GITHUB_MARK =
  'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z';

interface Card {
  snapshot: WrapSnapshot;
  options: CardOptions;
  copy: (typeof COPY)[Locale];
  id: (name: string) => string;
}

function background(card: Card, width: number, height: number, grain: boolean): string {
  const { id } = card;
  return (
    `<defs>` +
    // Frost light from the top left and a cooler bounce at the bottom right (Frost UI).
    `<radialGradient id="${id('light')}" cx="0.15" cy="-0.1" r="0.6" gradientTransform="translate(0.15 -0.1) scale(1.8 1) translate(-0.15 0.1)">` +
    `<stop offset="0" stop-color="#c8d6e2" stop-opacity="0.14"/><stop offset="1" stop-color="#c8d6e2" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${id('bounce')}" cx="1" cy="1.05" r="0.5" gradientTransform="translate(1 1.05) scale(1.6 1) translate(-1 -1.05)">` +
    `<stop offset="0" stop-color="#788ca0" stop-opacity="0.1"/><stop offset="1" stop-color="#788ca0" stop-opacity="0"/></radialGradient>` +
    // Film grain, like the approved mockup, kept grey so it never tints the colors.
    `<filter id="${id('grain')}" x="0" y="0" width="1" height="1">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>` +
    `<feColorMatrix type="saturate" values="0"/></filter>` +
    `<linearGradient id="${id('glass')}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${INK.white}" stop-opacity="0.075"/><stop offset="1" stop-color="${INK.white}" stop-opacity="0.035"/></linearGradient>` +
    `</defs>` +
    `<rect width="${width}" height="${height}" fill="${INK.background}"/>` +
    `<rect width="${width}" height="${height}" fill="url(#${id('light')})"/>` +
    `<rect width="${width}" height="${height}" fill="url(#${id('bounce')})"/>` +
    (grain
      ? `<rect width="${width}" height="${height}" fill="${INK.white}" filter="url(#${id('grain')})" opacity="0.05"/>`
      : '')
  );
}

/** Avatar, @login and the period chip, on one row between `left` and `right`. */
function header(card: Card, left: number, right: number, centerY: number): string {
  const { snapshot, options, id } = card;
  const radius = 11;
  const cx = left + radius;
  const avatar = options.avatarHref
    ? `<clipPath id="${id('avatar')}"><circle cx="${cx}" cy="${centerY}" r="${radius}"/></clipPath>` +
      `<image href="${escapeXml(options.avatarHref)}" x="${cx - radius}" y="${centerY - radius}" width="${radius * 2}" height="${radius * 2}" ` +
      `preserveAspectRatio="xMidYMid slice" clip-path="url(#${id('avatar')})"/>` +
      `<circle cx="${cx}" cy="${centerY}" r="${radius - 0.25}" fill="none" stroke="${INK.white}" stroke-opacity="0.14" stroke-width="0.5"/>`
    : `<circle cx="${cx}" cy="${centerY}" r="${radius}" fill="${INK.surface}" stroke="${INK.white}" stroke-opacity="0.14" stroke-width="0.5"/>` +
      `<text x="${cx}" y="${num(centerY + 3.6)}" text-anchor="middle" font-family="${SANS}" font-size="10" font-weight="600" fill="${INK.text}">` +
      `${escapeXml((snapshot.login[0] ?? '?').toUpperCase())}</text>`;

  const chip = periodChip(snapshot.period, options.locale);
  const chipWidth = textWidth(chip, 9) + 16;
  const chipX = right - chipWidth;
  const loginX = cx + radius + 7;
  const login = fitText(`@${snapshot.login}`, chipX - 8 - loginX, 11, true);

  return (
    avatar +
    `<text x="${loginX}" y="${num(centerY + 3.8)}" font-family="${MONO}" font-size="11" fill="${INK.text}">${escapeXml(login)}</text>` +
    `<rect x="${num(chipX)}" y="${centerY - 8}" width="${num(chipWidth)}" height="16" rx="8" fill="none" stroke="${INK.white}" stroke-opacity="0.1" stroke-width="0.75"/>` +
    `<text x="${num(chipX + chipWidth / 2)}" y="${num(centerY + 3.2)}" text-anchor="middle" font-family="${SANS}" font-size="9" fill="${INK.muted}">${escapeXml(chip)}</text>`
  );
}

function art(card: Card, x: number, y: number, width: number): string {
  const height = (width * ART_HEIGHT) / ART_WIDTH;
  const { snapshot, options } = card;
  const markup = artMarkup(options.style, snapshot, {
    locale: options.locale,
    animated: options.animated,
  });
  return `<svg x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}" viewBox="0 0 ${ART_WIDTH} ${ART_HEIGHT}">${markup}</svg>`;
}

interface Segment {
  text: string;
  emphasis?: 'strong' | 'positive';
}

/**
 * "↑ 23% vs. 2025 · 214 días activos · TypeScript 53%". A part whose data is hidden is left out,
 * and when the line would overflow, the last parts give way first.
 */
function summaryLine(card: Card, maxWidth: number, fontSize: number): string {
  const { snapshot, options, copy } = card;
  const { locale } = options;
  const groups: Segment[][] = [];

  const change = yearOverYear(snapshot.metrics.contributions, snapshot.previousContributions);
  if (change !== null) {
    const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '±';
    groups.push([
      { text: `${arrow} ${Math.abs(change)}%`, emphasis: change > 0 ? 'positive' : 'strong' },
      { text: ` vs. ${snapshot.period.year - 1}` },
    ]);
  }
  if (snapshot.activeDays !== null) {
    groups.push([
      { text: formatNumber(snapshot.activeDays, locale), emphasis: 'strong' },
      { text: ` ${copy.activeDays(snapshot.activeDays)}` },
    ]);
  }
  const totalBytes = snapshot.languages.reduce((sum, l) => sum + Math.max(0, l.bytes), 0);
  const top = [...snapshot.languages].sort((a, b) => b.bytes - a.bytes)[0];
  if (top && totalBytes > 0) {
    groups.push([
      { text: top.name, emphasis: 'strong' },
      { text: ` ${Math.round((top.bytes / totalBytes) * 100)}%` },
    ]);
  }

  const join = (list: Segment[][]) =>
    list.flatMap((group, i) => (i ? [{ text: ' · ' }, ...group] : group));
  const width = (list: Segment[][]) =>
    join(list).reduce((sum, s) => sum + textWidth(s.text, fontSize), 0);
  while (groups.length > 1 && width(groups) > maxWidth) groups.pop();

  return join(groups)
    .map((s) => {
      const fill =
        s.emphasis === 'positive' ? INK.positive : s.emphasis === 'strong' ? INK.text : INK.muted;
      const weight = s.emphasis ? ' font-weight="500"' : '';
      return `<tspan fill="${fill}"${weight}>${escapeXml(s.text)}</tspan>`;
    })
    .join('');
}

/** The glass strip: QR (or its marker), the call to scan, the link and the GitHub mark. */
function qrStrip(card: Card, x: number, y: number, width: number): string {
  const { snapshot, options, copy } = card;
  const url = publicWrapUrl(options.publicBaseUrl, snapshot.login, snapshot.period.year);
  const height = 68;
  const qrSize = 54;
  const qrX = x + 7;
  const qrY = y + 7;
  const textX = qrX + qrSize + 10;
  const markX = x + width - 7 - 4 - 14;
  const shown = url.replace(/^https?:\/\//, '');
  const room = markX - 8 - textX;
  const urlSize = Math.max(6, Math.min(8.5, room / (shown.length * MONO_ADVANCE)));
  const code =
    options.qr === 'placeholder'
      ? qrPlaceholderMarkup(qrX, qrY, qrSize, 8)
      : qrMarkup(url, qrX, qrY, qrSize, 8);

  return (
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" fill="url(#${card.id('glass')})" ` +
    `stroke="${INK.white}" stroke-opacity="0.09" stroke-width="0.75"/>` +
    code +
    `<text x="${textX}" y="${y + 30}" font-family="${SANS}" font-size="11" font-weight="500" fill="${INK.text}">${copy.scan}</text>` +
    `<text x="${textX}" y="${y + 44}" font-family="${MONO}" font-size="${num(urlSize)}" fill="${INK.muted}">` +
    `${escapeXml(fitText(shown, room, urlSize, true))}</text>` +
    `<path transform="translate(${num(markX)} ${y + 27}) scale(0.875)" d="${GITHUB_MARK}" fill="${INK.text}" opacity="0.45"/>`
  );
}

/** The big number with its label, or the period when contributions are hidden. */
function headline(card: Card, x: number, y: number, size: number, inlineLabel: boolean): string {
  const { snapshot, options, copy } = card;
  const total = snapshot.metrics.contributions;
  if (total === null) {
    return (
      `<text x="${x}" y="${y}" font-family="${SANS}" font-size="${num(size * 0.62)}" font-weight="600" ` +
      `letter-spacing="${num(-size * 0.02)}" fill="${INK.text}">${escapeXml(periodLabel(snapshot.period, options.locale))}</text>`
    );
  }
  const number = `<tspan font-size="${size}" font-weight="600" letter-spacing="${num(-size * 0.035)}" fill="${INK.text}">${formatNumber(total, options.locale)}</tspan>`;
  const label = copy.contributions(total);
  return inlineLabel
    ? `<text x="${x}" y="${y}" font-family="${SANS}">${number}<tspan dx="6" font-size="${num(size * 0.4)}" fill="${INK.muted}">${label}</tspan></text>`
    : `<text x="${x}" y="${y}" font-family="${SANS}">${number}</text>` +
        `<text x="${x}" y="${y + size * 0.48}" font-family="${SANS}" font-size="${num(size * 0.3)}" fill="${INK.muted}">${label}</text>`;
}

function portrait(card: Card): string {
  const { width, height } = VIEW.portrait;
  return (
    background(card, width, height, true) +
    header(card, 16, width - 16, 25) +
    art(card, 0, 38, ART_WIDTH) +
    headline(card, 16, 245, 30, true) +
    `<text x="16" y="265" font-family="${SANS}" font-size="10">${summaryLine(card, width - 32, 10)}</text>` +
    qrStrip(card, 12, height - 12 - 68, width - 24)
  );
}

function landscape(card: Card): string {
  const { width, height } = VIEW.landscape;
  const { snapshot, options } = card;
  const kicker =
    snapshot.metrics.contributions === null
      ? ''
      : `<text x="24" y="98" font-family="${SANS}" font-size="10" font-weight="500" letter-spacing="0.8" fill="${INK.muted}">` +
        `${escapeXml(periodLabel(snapshot.period, options.locale).toLocaleUpperCase(options.locale))}</text>`;
  return (
    // No grain on the link preview: it is shown as a small thumbnail and the noise only adds bytes.
    background(card, width, height, false) +
    header(card, 24, width - 24, 32) +
    art(card, 278, 62, 306) +
    kicker +
    headline(card, 24, 152, 50, false) +
    `<text x="24" y="200" font-family="${SANS}" font-size="11">${summaryLine(card, 250, 11)}</text>` +
    qrStrip(card, 18, height - 18 - 68, 252)
  );
}

/**
 * The whole share card as one SVG (art, texts and QR) so the PNG needs no browser: same snapshot
 * and options, same bytes. No `backdrop-filter`: the glass is translucent fills resvg can draw.
 */
export function renderCard(snapshot: WrapSnapshot, options: CardOptions): string {
  const seed = seedFor(snapshot.githubUserId, snapshot.period.year).toString(36);
  const card: Card = {
    snapshot,
    options,
    copy: COPY[options.locale],
    id: (name) => `gw-card-${options.format}-${name}-${seed}`,
  };
  const { width, height } = CARD_SIZES[options.format];
  const view = VIEW[options.format];
  const css = options.animated ? `<style>${ANIMATION_CSS}</style>` : '';
  const body = options.format === 'portrait' ? portrait(card) : landscape(card);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${view.width} ${view.height}" ` +
    `role="img" aria-label="${escapeXml(card.copy.card(snapshot.login))}">${css}${body}</svg>`
  );
}
