import { SUPPORTED_LOCALES } from '../src';

describe('@wrapped/shared', () => {
  it('supports Spanish and English', () => {
    expect(SUPPORTED_LOCALES).toEqual(['es', 'en']);
  });
});
