import { normalizeLogin } from '../src';

describe('normalizeLogin', () => {
  it('lowercases and trims, so every spelling shares one cache key', () => {
    expect(normalizeLogin('  JPJimenez ')).toBe('jpjimenez');
  });

  it('drops a leading @', () => {
    expect(normalizeLogin('@ana-dev')).toBe('ana-dev');
  });

  it('accepts a pasted profile URL', () => {
    expect(normalizeLogin('https://github.com/Ana-Dev/')).toBe('ana-dev');
    expect(normalizeLogin('github.com/ana-dev')).toBe('ana-dev');
    expect(normalizeLogin('https://www.github.com/ana-dev?tab=repositories')).toBe('ana-dev');
  });

  it('accepts the longest login GitHub allows (39 characters)', () => {
    expect(normalizeLogin('a'.repeat(39))).toBe('a'.repeat(39));
  });

  it.each([
    ['empty', ''],
    ['only an @', '@'],
    ['too long', 'a'.repeat(40)],
    ['leading hyphen', '-ana'],
    ['trailing hyphen', 'ana-'],
    ['double hyphen', 'ana--dev'],
    ['spaces inside', 'ana dev'],
    ['path traversal', '../etc'],
    ['another site', 'https://gitlab.com/ana'],
  ])('rejects %s', (_, raw) => {
    expect(normalizeLogin(raw)).toBeNull();
  });
});
