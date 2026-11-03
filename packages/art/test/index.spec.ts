import { CARD_STYLES } from '../src';

describe('@wrapped/art', () => {
  it('offers the three approved card styles', () => {
    expect(CARD_STYLES).toEqual(['huella', 'cordillera', 'constelacion']);
  });
});
