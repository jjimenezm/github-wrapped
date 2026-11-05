import { videoObjectKey, wrapImages, wrapVideo } from '../src';

const ID = '3f0c8a52-1b9e-4c7a-9d10-5e2f6b7a8c9d';

describe('wrap images', () => {
  it('points at the card and the link preview of one images version, as the api serves them', () => {
    expect(wrapImages(ID, 3)).toEqual({
      card: `/api/files/${ID}/img/3/card.png`,
      og: `/api/files/${ID}/img/3/og.png`,
    });
  });
});

describe('wrap video', () => {
  it('plays from the api when videos live on the shared volume', () => {
    expect(wrapVideo(ID, 2)).toBe(`/api/files/${ID}/video/2.mp4`);
  });

  it('plays from the media origin when videos live in the bucket', () => {
    expect(wrapVideo(ID, 2, 'https://media.example.dev')).toBe(
      `https://media.example.dev/wrapped/${ID}/2.mp4`,
    );
    expect(videoObjectKey(ID, 2)).toBe(`wrapped/${ID}/2.mp4`);
  });
});
