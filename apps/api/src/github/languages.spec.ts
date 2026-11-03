import { summarizeLanguages } from './languages';
import type { OwnRepository } from './queries';

const repo = (sizes: Array<[string, string | null, number]>, isFork = false): OwnRepository => ({
  isFork,
  languages: { edges: sizes.map(([name, color, size]) => ({ size, node: { name, color } })) },
});

describe('summarizeLanguages', () => {
  it('adds bytes per language across repos and keeps the top three', () => {
    const summary = summarizeLanguages([
      repo([
        ['TypeScript', '#3178c6', 400],
        ['SCSS', '#c6538c', 50],
      ]),
      repo([
        ['PHP', '#4F5D95', 310],
        ['TypeScript', '#3178c6', 80],
      ]),
      repo([
        ['SCSS', '#c6538c', 70],
        ['Shell', '#89e051', 20],
        ['Nix', null, 15],
      ]),
    ]);
    expect(summary.languages).toEqual([
      { name: 'TypeScript', color: '#3178c6', bytes: 480 },
      { name: 'PHP', color: '#4F5D95', bytes: 310 },
      { name: 'SCSS', color: '#c6538c', bytes: 120 },
    ]);
    expect(summary.otherBytes).toBe(35);
  });

  it('never counts forks', () => {
    const summary = summarizeLanguages([
      repo([['Go', '#00ADD8', 10]]),
      repo([['Rust', '#dea584', 999]], true),
    ]);
    expect(summary.languages.map((l) => l.name)).toEqual(['Go']);
    expect(summary.otherBytes).toBe(0);
  });

  it('keeps a missing color as null for the art fallback', () => {
    expect(summarizeLanguages([repo([['Nix', null, 5]])]).languages[0]?.color).toBeNull();
  });

  it('orders equal sizes by name', () => {
    const summary = summarizeLanguages([
      repo([
        ['Zig', null, 5],
        ['Ada', null, 5],
      ]),
    ]);
    expect(summary.languages.map((l) => l.name)).toEqual(['Ada', 'Zig']);
  });

  it('handles a person without repos', () => {
    expect(summarizeLanguages([])).toEqual({ languages: [], otherBytes: 0 });
  });
});
