import { CARD_STYLES, publicWrapUrl, type WrapSnapshot } from '@wrapped/shared';
import { CARD_SIZES, renderCard, type CardOptions } from '../src';
import { BASE_URL, makeSnapshot } from './fixtures';
import { decodeQr, renderSize } from './helpers';

const options = (overrides: Partial<CardOptions> = {}): CardOptions => ({
  style: 'huella',
  locale: 'es',
  format: 'portrait',
  publicBaseUrl: BASE_URL,
  ...overrides,
});

const card = (snapshot: Partial<WrapSnapshot> = {}, opts: Partial<CardOptions> = {}) =>
  renderCard(makeSnapshot(snapshot), options(opts));

const NO_METRICS = {
  contributions: null,
  commits: null,
  mergedPRs: null,
  reviews: null,
  issues: null,
};

describe('renderCard', () => {
  it('has the exact pixel sizes of the PNG (4:5) and the link preview (1200×630)', () => {
    expect(CARD_SIZES).toEqual({
      portrait: { width: 1080, height: 1350 },
      landscape: { width: 1200, height: 630 },
    });
    expect(renderSize(card())).toEqual({ width: 1080, height: 1350 });
    expect(renderSize(card({}, { format: 'landscape' }))).toEqual({ width: 1200, height: 630 });
  });

  describe.each(CARD_STYLES)('%s', (style) => {
    it.each(['portrait', 'landscape'] as const)(
      'is identical byte for byte across runs (%s)',
      (format) => {
        const runs = [1, 2, 3].map(() => renderCard(makeSnapshot(), options({ style, format })));
        expect(runs[1]).toBe(runs[0]);
        expect(runs[2]).toBe(runs[0]);
      },
    );

    it.each(['portrait', 'landscape'] as const)(
      'carries a QR that decodes to the public URL (%s)',
      (format) => {
        expect(decodeQr(card({}, { style, format }))).toBe(
          publicWrapUrl(BASE_URL, 'jpjimenez', 2026),
        );
      },
    );

    it('renders edge-case snapshots without NaN, undefined or null', () => {
      const svg = card(
        {
          languages: [],
          featured: [],
          weekly: [],
          metrics: NO_METRICS,
          activeDays: null,
          previousContributions: null,
        },
        { style },
      );
      expect(svg).not.toMatch(/NaN|undefined|null|Infinity/);
      expect(() => renderSize(svg)).not.toThrow();
    });
  });

  it('speaks Spanish: "contribuciones" and 1.284', () => {
    const svg = card();
    expect(svg).toContain('1.284');
    expect(svg).toContain('contribuciones');
    expect(svg).toContain('días activos');
    expect(svg).toContain('Escanea mi año en GitHub');
    expect(svg).toContain('ene–nov 2026');
  });

  it('speaks English: "contributions" and 1,284', () => {
    const svg = card({}, { locale: 'en' });
    expect(svg).toContain('1,284');
    expect(svg).toContain('contributions');
    expect(svg).not.toContain('contribuciones');
    expect(svg).toContain('active days');
    expect(svg).toContain('Scan my year on GitHub');
    expect(svg).toContain('Jan–Nov 2026');
  });

  it('uses the singular for a single contribution', () => {
    const metrics = { ...makeSnapshot().metrics, contributions: 1 };
    expect(card({ metrics })).toMatch(/>contribución</);
    expect(card({ metrics }, { locale: 'en' })).toMatch(/>contribution</);
  });

  it('shows the year-over-year change with its direction', () => {
    expect(card()).toContain('↑ 23%');
    expect(card({ previousContributions: 1396 })).toContain('↓ 8%');
  });

  it('hides the comparison when the previous year is zero or unknown', () => {
    expect(card({ previousContributions: 0 })).not.toMatch(/[↑↓] /);
    expect(card({ previousContributions: null })).not.toMatch(/[↑↓] /);
  });

  it('names the top language with its share of bytes', () => {
    expect(card()).toContain('TypeScript');
    expect(card()).toContain('53%');
  });

  it('falls back to the period label when contributions are hidden', () => {
    const svg = card({ metrics: { ...makeSnapshot().metrics, contributions: null } });
    expect(svg).toContain('Hasta noviembre de 2026');
    expect(svg).not.toContain('contribuciones');
  });

  it('escapes the login everywhere it is printed', () => {
    const svg = card({ login: 'a<b>&"c' });
    expect(svg).not.toContain('a<b>');
    expect(svg).toContain('a&lt;b&gt;&amp;&quot;c');
  });

  it('shortens a very long login in the header but keeps the full URL in the QR', () => {
    const login = 'a'.repeat(39);
    const svg = card({ login });
    expect(svg).toContain('…');
    expect(decodeQr(svg)).toBe(publicWrapUrl(BASE_URL, login, 2026));
  });

  it('shows an unscannable marker instead of the QR before publishing', () => {
    const svg = card({}, { qr: 'placeholder' });
    expect(decodeQr(svg)).toBeNull();
    expect(svg).toContain('Escanea mi año en GitHub');
  });

  it('uses the avatar image when one is provided, and the initial otherwise', () => {
    expect(card()).not.toContain('<image');
    expect(card()).toMatch(/>J</);
    const withAvatar = card({}, { avatarHref: 'data:image/png;base64,AAAA' });
    expect(withAvatar).toContain('<image');
    expect(withAvatar).toContain('href="data:image/png;base64,AAAA"');
  });

  it('keeps portrait and landscape ids apart, since a page can show both', () => {
    const ids = (svg: string) => [...svg.matchAll(/\bid="(gw-card-[^"]+)"/g)].map((m) => m[1]);
    const opts = { avatarHref: 'data:image/png;base64,AAAA' };
    const landscape = ids(card({}, { ...opts, format: 'landscape' }));
    for (const id of ids(card({}, opts))) expect(landscape).not.toContain(id);
  });

  it('never uses backdrop-filter, which resvg does not support', () => {
    for (const format of ['portrait', 'landscape'] as const) {
      expect(card({}, { format })).not.toContain('backdrop-filter');
    }
  });
});
