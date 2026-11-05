import { UnrecoverableError, type Job } from 'bullmq';
import { isFinalFailure } from './video.worker';

const job = (attemptsMade: number, attempts = 2) =>
  ({ attemptsMade, opts: { attempts } }) as unknown as Job;

describe('video worker', () => {
  it('waits for the automatic retry before marking a video failed', () => {
    expect(isFinalFailure(job(1), new Error('Chrome crashed'))).toBe(false);
    expect(isFinalFailure(job(2), new Error('Chrome crashed'))).toBe(true);
  });

  it('gives up at once on a timeout', () => {
    expect(isFinalFailure(job(1), new UnrecoverableError('timed out'))).toBe(true);
  });

  it('fails for good after the owner’s retry, which gets a single attempt', () => {
    expect(isFinalFailure(job(3), new Error('Chrome crashed'))).toBe(true);
  });
});
