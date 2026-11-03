import { ART_HEIGHT, ART_WIDTH, layoutConstelacion, renderArt } from '../src';
import { makeSnapshot, repo } from './fixtures';

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const longName = (prefix: string) => `${prefix}-${'x'.repeat(60 - prefix.length - 1)}`;

describe('layoutConstelacion', () => {
  it('turns each featured repo into a star and names the two most active', () => {
    const { stars, labels } = layoutConstelacion(makeSnapshot(), 'es');
    expect(stars.filter((s) => s.repo !== null).map((s) => s.repo)).toEqual([
      'sismos-chile-api',
      'github-wrapped',
      'release-to-video',
    ]);
    expect(labels.map((l) => l.name)).toEqual(['sismos-chile-api', 'github-wrapped']);
    expect(labels.map((l) => l.count)).toEqual(['128', '96']);
  });

  it('formats commit counts for the locale', () => {
    const featured = [repo('big', 1024), repo('small', 9)];
    expect(layoutConstelacion(makeSnapshot({ featured }), 'en').labels[0]?.count).toBe('1,024');
  });

  it('sizes stars by commits', () => {
    const named = layoutConstelacion(makeSnapshot(), 'es').stars.filter((s) => s.repo !== null);
    expect(named[0]!.r).toBeGreaterThan(named[1]!.r);
    expect(named[1]!.r).toBeGreaterThan(named[2]!.r);
  });

  it('keeps the sky full of stardust when there are no featured repos', () => {
    const { stars, labels, dust } = layoutConstelacion(makeSnapshot({ featured: [] }), 'es');
    expect(labels).toEqual([]);
    expect(stars.every((s) => s.repo === null)).toBe(true);
    expect(dust.length).toBeGreaterThanOrEqual(40);
    expect(
      renderArt('constelacion', makeSnapshot({ featured: [] }), { locale: 'es' }),
    ).not.toContain('<text');
  });

  it('truncates a 60-character repo name with an ellipsis', () => {
    const featured = [repo(longName('alpha'), 128), repo(longName('beta'), 120)];
    const { labels } = layoutConstelacion(makeSnapshot({ featured }), 'es');
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      expect(label.name.endsWith('…')).toBe(true);
      expect(label.name.length).toBeLessThan(60);
    }
  });

  it('never lets two labels overlap or leave the art box, whatever the seed', () => {
    const featured = [repo(longName('alpha'), 128), repo(longName('beta'), 127), repo('c', 126)];
    for (let id = 1; id <= 300; id++) {
      const { labels } = layoutConstelacion(makeSnapshot({ githubUserId: id, featured }), 'es');
      const [a, b] = labels;
      if (a && b) expect(overlaps(a.box, b.box)).toBe(false);
      for (const { box } of labels) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(ART_WIDTH);
        expect(box.y + box.height).toBeLessThanOrEqual(ART_HEIGHT);
      }
    }
  });

  it('escapes repo names before they reach the SVG', () => {
    const svg = renderArt('constelacion', makeSnapshot({ featured: [repo('<b>&"x', 9)] }), {
      locale: 'es',
    });
    expect(svg).toContain('&lt;b&gt;&amp;&quot;x');
    expect(svg).not.toContain('<b>');
  });
});
