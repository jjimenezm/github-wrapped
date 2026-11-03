import { UrlSegment, type UrlSegmentGroup } from '@angular/router';
import { wrapMatcher, wrapPath } from './wrap-url';

const segments = (path: string) => path.split('/').map((p) => new UrlSegment(p, {}));
const match = (suffix: 'share' | 'card', path: string) =>
  wrapMatcher(suffix)(segments(path), {} as UrlSegmentGroup, {});

describe('wrap URLs', () => {
  it('builds /@login/year/suffix', () => {
    expect(wrapPath('ana-dev', 2026, 'share')).toBe('/@ana-dev/2026/share');
    expect(wrapPath('ana-dev', 2026)).toBe('/@ana-dev/2026');
  });

  it('matches @login, a year and the suffix, and hands over login and year', () => {
    const result = match('share', '@ana-dev/2026/share');

    expect(result?.posParams?.['login']?.path).toBe('ana-dev');
    expect(result?.posParams?.['year']?.path).toBe('2026');
  });

  it('turns down anything else', () => {
    expect(match('share', 'ana-dev/2026/share')).toBeNull();
    expect(match('share', '@ana-dev/20x6/share')).toBeNull();
    expect(match('share', '@ana-dev/2026/card')).toBeNull();
    expect(match('card', '@ana-dev/2026')).toBeNull();
    expect(match('card', '@/2026/card')).toBeNull();
  });
});
