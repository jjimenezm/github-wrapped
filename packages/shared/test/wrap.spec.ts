import { wrapImages } from '../src';

describe('wrap images', () => {
  it('points at the card and the link preview of one images version, as the api serves them', () => {
    expect(wrapImages('3f0c8a52-1b9e-4c7a-9d10-5e2f6b7a8c9d', 3)).toEqual({
      card: '/api/files/3f0c8a52-1b9e-4c7a-9d10-5e2f6b7a8c9d/img/3/card.png',
      og: '/api/files/3f0c8a52-1b9e-4c7a-9d10-5e2f6b7a8c9d/img/3/og.png',
    });
  });
});
