/**
 * Writes a sample page with every card, in the browser (inline SVG) and as the PNG the renderer
 * will publish (resvg with Geist), to `/.data/art-sample/` at the repo root (ignored by git).
 *
 *   pnpm --filter @wrapped/art sample
 */
import { Resvg } from '@resvg/resvg-js';
import { CARD_STYLES, type CardStyle, type Locale, type WrapSnapshot } from '@wrapped/shared';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderCard, type CardFormat, type CardOptions } from '../src';
import { BASE_URL, DEMO_SNAPSHOTS, language, makeSnapshot, repo } from '../test/fixtures';

const OUT = resolve(__dirname, '../../../.data/art-sample');
const FONTS = resolve(__dirname, '../node_modules/geist/dist/fonts');
const fontFiles = [
  ...['Regular', 'Medium', 'SemiBold'].map((w) => join(FONTS, `geist-sans/Geist-${w}.ttf`)),
  ...['Regular', 'Medium'].map((w) => join(FONTS, `geist-mono/GeistMono-${w}.ttf`)),
];

const NAMES: Record<CardStyle, string> = {
  huella: 'Huella',
  cordillera: 'Cordillera',
  constelacion: 'Constelación',
};

const options = (style: CardStyle, extra: Partial<CardOptions> = {}): CardOptions => ({
  style,
  locale: 'es',
  format: 'portrait',
  publicBaseUrl: BASE_URL,
  ...extra,
});

function png(svg: string, file: string): { file: string; ms: number } {
  const started = performance.now();
  const image = new Resvg(svg, {
    font: { loadSystemFonts: false, fontFiles, defaultFontFamily: 'Geist' },
  }).render();
  writeFileSync(join(OUT, file), image.asPng());
  return { file, ms: Math.round(performance.now() - started) };
}

const figure = (body: string, caption: string) =>
  `<figure>${body}<figcaption>${caption}</figcaption></figure>`;

const inline = (snapshot: WrapSnapshot, opts: CardOptions, caption: string) =>
  figure(
    `<div class="svg ${opts.format}">${renderCard(snapshot, { ...opts, animated: true })}</div>`,
    caption,
  );

const section = (title: string, note: string, figures: string[]) =>
  `<section><h2>${title}</h2><p>${note}</p><div class="row">${figures.join('')}</div></section>`;

const timings: number[] = [];
function pngFigure(snapshot: WrapSnapshot, opts: CardOptions, caption: string) {
  const name = `${String(timings.length + 1).padStart(2, '0')}-${opts.style}-${opts.format}-${opts.locale}.png`;
  const { file, ms } = png(renderCard(snapshot, opts), name);
  timings.push(ms);
  return figure(
    `<img class="${opts.format}" src="${file}" alt="${caption}">`,
    `${caption} · ${ms} ms`,
  );
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const [me] = DEMO_SNAPSHOTS as [WrapSnapshot];
const edge = makeSnapshot({
  githubUserId: 99,
  login: 'una-persona-con-un-login-larguisimo-39',
  languages: [],
  featured: [],
  weekly: Array(44).fill(0),
  previousContributions: 0,
});
const longNames = makeSnapshot({
  githubUserId: 101,
  languages: [language('Nix', null, 300), language('Rust', '#dea584', 100)],
  featured: [
    repo(`plataforma-${'x'.repeat(49)}`, 140, ['Nix']),
    repo(`otro-proyecto-${'y'.repeat(46)}`, 133, ['Rust']),
    repo('cli', 12),
  ],
});
const hidden = makeSnapshot({
  githubUserId: 102,
  metrics: { contributions: null, commits: 10, mergedPRs: null, reviews: null, issues: null },
  activeDays: null,
  languages: [language('Go', '#00ADD8', 1)],
});

const sections = [
  ...DEMO_SNAPSHOTS.map((snapshot) =>
    section(
      `@${snapshot.login}`,
      'Tarjeta 4:5 dibujada en el navegador (SVG con animación de entrada).',
      CARD_STYLES.map((style) => inline(snapshot, options(style), NAMES[style])),
    ),
  ),
  section(
    'PNG 1080×1350 (resvg, sin navegador)',
    'Lo que se publica: mismo SVG rasterizado con Geist embebida. Compáralo con la fila de arriba.',
    CARD_STYLES.map((style) => pngFigure(me, options(style), NAMES[style])),
  ),
  section(
    'Vista previa del link 1200×630',
    'Imagen Open Graph / X que sale de la tarjeta elegida.',
    CARD_STYLES.map((style) =>
      pngFigure(me, options(style, { format: 'landscape' }), NAMES[style]),
    ),
  ),
  section(
    'English',
    'Mismo wrap en inglés: textos y formato de números (1,284).',
    CARD_STYLES.map((style) =>
      inline(me, options(style, { locale: 'en' as Locale }), NAMES[style]),
    ),
  ),
  section(
    'Antes de publicar',
    'En el carrusel, la franja muestra un marcador en vez del QR: ninguna captura comparte un link que todavía no existe.',
    CARD_STYLES.map((style) => inline(me, options(style, { qr: 'placeholder' }), NAMES[style])),
  ),
  section(
    'Casos borde',
    'En PNG: sin lenguajes, sin repos y semanas en 0 (login de 39 caracteres) · nombres de repo de 60 caracteres y un lenguaje sin color · contribuciones ocultas.',
    [
      ...CARD_STYLES.map((style) => pngFigure(edge, options(style), `${NAMES[style]} · vacío`)),
      pngFigure(longNames, options('constelacion'), 'Constelación · nombres largos'),
      pngFigure(longNames, options('huella'), 'Huella · lenguaje sin color'),
      pngFigure(hidden, options('cordillera'), 'Cordillera · métrica oculta'),
    ],
  ),
];

const formats: CardFormat[] = ['portrait', 'landscape'];
const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tarjetas de GitHub Wrapped</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: dark; --bg: #07090c; --text: #e7ecf0; --muted: #8b97a3; --line: rgba(255,255,255,.08); }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 40px 16px 80px; background: var(--bg); color: var(--text); font: 15px/1.5 'Geist', system-ui, sans-serif; }
  main { max-width: 1120px; margin: 0 auto; }
  h1 { font-size: 28px; font-weight: 600; letter-spacing: -.02em; margin: 0 0 6px; }
  h2 { font: 500 14px/1 'Geist Mono', monospace; margin: 0 0 6px; }
  header p, section p { color: var(--muted); margin: 0 0 18px; max-width: 70ch; }
  section { padding: 28px 0; border-top: 1px solid var(--line); }
  .row { display: flex; flex-wrap: wrap; gap: 24px; }
  figure { margin: 0; }
  figcaption { margin-top: 8px; color: var(--muted); font-size: 13px; }
  .svg svg, img { display: block; border-radius: 22px; box-shadow: 0 18px 40px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.1); }
  ${formats.map((f) => `.${f} svg, img.${f} { width: ${f === 'portrait' ? 300 : 340}px; height: auto; }`).join('\n  ')}
</style>
</head>
<body>
<main>
<header>
  <h1>Tarjetas de GitHub Wrapped</h1>
  <p>Generado por <code>packages/art</code>: funciones puras que devuelven el SVG completo. Mismo snapshot, mismos bytes; otra persona con los mismos números, otra tarjeta.</p>
</header>
${sections.join('\n')}
</main>
</body>
</html>
`;

writeFileSync(join(OUT, 'index.html'), html);
const average = Math.round(timings.reduce((a, b) => a + b, 0) / timings.length);
console.log(`Sample written to ${OUT}/index.html (${timings.length} PNGs, ~${average} ms each)`);
