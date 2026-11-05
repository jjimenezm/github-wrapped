import {
  IMAGES_JOB_OPTIONS,
  IMAGES_QUEUE,
  imagesJobId,
  VIDEO_JOB_OPTIONS,
  VIDEO_QUEUE,
  videoJobId,
} from '../src';

describe('image render jobs', () => {
  it('names one job per wrap and images version, without the ":" BullMQ forbids', () => {
    const id = imagesJobId('3f0c8a52-1b9e-4c7a-9d10-5e2f6b7a8c9d', 2);
    expect(id).toBe('images-3f0c8a52-1b9e-4c7a-9d10-5e2f6b7a8c9d-2');
    expect(id).not.toContain(':');
  });

  it('retries a failed render a few times, backing off', () => {
    expect(IMAGES_QUEUE).toBe('images');
    expect(IMAGES_JOB_OPTIONS.attempts).toBeGreaterThan(1);
    expect(IMAGES_JOB_OPTIONS.backoff.type).toBe('exponential');
  });
});

describe('video render jobs', () => {
  it('names one job per wrap and data version, without ":"', () => {
    const id = videoJobId('3f0c8a52-1b9e-4c7a-9d10-5e2f6b7a8c9d', 4);
    expect(id).toBe('video-3f0c8a52-1b9e-4c7a-9d10-5e2f6b7a8c9d-4');
    expect(id).not.toContain(':');
  });

  it('keeps failed renders so the owner can retry that same job', () => {
    expect(VIDEO_QUEUE).toBe('video');
    expect(VIDEO_JOB_OPTIONS.removeOnFail).toBe(false);
    expect(VIDEO_JOB_OPTIONS.attempts).toBe(2);
  });
});
