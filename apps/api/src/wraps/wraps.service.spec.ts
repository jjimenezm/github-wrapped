import { join } from 'node:path';
import { MemoryStore } from '../common/store';
import { GithubClient } from '../github/github.client';
import { GithubUnavailableError } from '../github/github.errors';
import { FixtureGithubTransport, type GithubTransport } from '../github/github.transport';
import { SnapshotBuilder } from '../github/snapshot.builder';
import { InMemoryRenderQueue } from '../render/render-queue';
import { PreviewService } from './preview.service';
import {
  ImagesNotFailedError,
  NotOwnerError,
  RegenerateTooSoonError,
  WrapDeletedError,
  WrapNotFoundError,
  YearFrozenError,
} from './wrap.errors';
import { InMemoryWrapsRepository } from './wraps.repository';
import { WrapsService } from './wraps.service';

const FIXTURES = join(__dirname, '../../test/fixtures/github');
const ana = { githubUserId: 4242, login: 'ana-dev' };
const beto = { githubUserId: 7777, login: 'beto' };

function setup(start = '2026-03-01T12:00:00Z') {
  let now = new Date(start);
  const clock = () => now;
  const fixtures = new FixtureGithubTransport(FIXTURES);
  const failing = new Set<string>();
  const transport: GithubTransport = {
    execute: jest.fn((operation: string, query: string, variables: Record<string, unknown>) =>
      failing.has(operation)
        ? Promise.reject(new GithubUnavailableError('502'))
        : fixtures.execute(operation, query, variables),
    ),
  };
  const previews = new PreviewService(
    new SnapshotBuilder(new GithubClient(transport)),
    new MemoryStore(() => now.getTime()),
    clock,
  );
  const repo = new InMemoryWrapsRepository();
  const queue = new InMemoryRenderQueue();
  const removedFiles: string[] = [];
  const files = { remove: (id: string) => Promise.resolve(void removedFiles.push(id)) };
  const service = new WrapsService(repo, queue, files, previews, clock);
  return {
    service,
    repo,
    queue,
    removedFiles,
    failing,
    previews,
    at: (iso: string) => (now = new Date(iso)),
    later: (hours: number) => (now = new Date(now.getTime() + hours * 3_600_000)),
  };
}

const publishAna = (t: ReturnType<typeof setup>, overrides = {}) =>
  t.service.publish(ana, '@Ana-Dev', { cardStyle: 'huella', locale: 'es', ...overrides });

describe('WrapsService', () => {
  describe('publish', () => {
    it('creates the wrap with its frozen snapshot and queues the images', async () => {
      const t = setup();
      const wrap = await publishAna(t, { locale: 'en', cardStyle: 'cordillera' });
      expect(wrap).toMatchObject({
        githubUserId: 4242,
        login: 'ana-dev',
        year: 2026,
        locale: 'en',
        cardStyle: 'cordillera',
        status: 'published',
        dataVersion: 1,
        imagesVersion: 1,
        imagesStatus: 'queued',
        videoStatus: 'none',
      });
      expect(wrap.snapshot?.metrics.contributions).toBe(285);
      expect(t.queue.jobs).toEqual([
        { id: `images-${wrap.id}-1`, wrapId: wrap.id, version: 1, state: 'waiting' },
      ]);
    });

    it('refuses to publish someone else’s login and saves nothing', async () => {
      const t = setup();
      await expect(
        t.service.publish(ana, 'beto', { cardStyle: 'huella', locale: 'es' }),
      ).rejects.toBeInstanceOf(NotOwnerError);
      expect(await t.repo.findByOwner(7777, 2026)).toBeNull();
      expect(t.queue.jobs).toEqual([]);
    });

    it('counts publishing the same year again as a regeneration: once a day', async () => {
      const t = setup();
      const first = await publishAna(t);
      t.later(23);
      const error = await publishAna(t).catch((e: unknown) => e);
      expect(error).toEqual(new RegenerateTooSoonError(new Date('2026-03-02T12:00:00Z')));
      expect(t.queue.jobs).toHaveLength(1);

      t.later(1);
      const again = await publishAna(t, { cardStyle: 'constelacion' });
      expect(again).toMatchObject({
        id: first.id,
        dataVersion: 2,
        imagesVersion: 2,
        cardStyle: 'constelacion',
      });
      expect(t.queue.jobs.map((j) => j.id)).toEqual([
        `images-${first.id}-1`,
        `images-${first.id}-2`,
      ]);
    });

    it('lets only one of two simultaneous republications through', async () => {
      const t = setup();
      await publishAna(t);
      t.later(25);
      const results = await Promise.allSettled([publishAna(t), publishAna(t)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const [rejected] = results.filter((r) => r.status === 'rejected');
      expect(rejected?.reason).toBeInstanceOf(RegenerateTooSoonError);
      expect((await t.repo.findByOwner(4242, 2026))?.dataVersion).toBe(2);
    });

    it('retries what failed in the cached lookup before freezing the snapshot', async () => {
      const t = setup();
      t.failing.add('MergedPullRequests');
      expect((await t.previews.preview('ana-dev')).metrics.mergedPRs).toBeNull();
      t.failing.clear();
      const wrap = await publishAna(t);
      expect(wrap.snapshot?.metrics.mergedPRs).toBe(86);
      expect(wrap.snapshot?.failedMetrics).toEqual([]);
    });

    it('follows a rename: same GitHub id, new login, one wrap', async () => {
      const t = setup();
      const first = await publishAna(t);
      t.later(25);
      const renamed = await t.service.publish(
        { githubUserId: 4242, login: 'ana-nueva' },
        'ana-nueva',
        { cardStyle: 'huella', locale: 'es' },
      );
      expect(renamed.id).toBe(first.id);
      expect((await t.service.findPublic('ana-nueva', 2026)).moved).toBe(false);
      expect(await t.service.findPublic('ana-dev', 2026)).toMatchObject({ moved: true });
    });
  });

  describe('regenerate', () => {
    it('refreshes the data once a day', async () => {
      const t = setup();
      const wrap = await publishAna(t);
      t.later(25);
      const regenerated = await t.service.regenerate(wrap);
      expect(regenerated).toMatchObject({
        dataVersion: 2,
        imagesVersion: 2,
        imagesStatus: 'queued',
      });
      await expect(t.service.regenerate(regenerated)).rejects.toBeInstanceOf(
        RegenerateTooSoonError,
      );
    });

    it('still works in January for last year’s wrap', async () => {
      const t = setup('2026-12-20T12:00:00Z');
      const wrap = await publishAna(t);
      t.at('2027-01-10T12:00:00Z');
      await expect(t.service.regenerate(wrap)).resolves.toMatchObject({ dataVersion: 2 });
    });

    it('is closed once the year is frozen (after January 31)', async () => {
      const t = setup();
      const wrap = await publishAna(t);
      t.at('2027-02-02T12:00:00Z');
      await expect(t.service.regenerate(wrap)).rejects.toBeInstanceOf(YearFrozenError);
    });
  });

  describe('changeCard', () => {
    it('renders new images only: the data and the video stay', async () => {
      const t = setup();
      const wrap = await publishAna(t);
      const changed = await t.service.changeCard(wrap, 'constelacion');
      expect(changed).toMatchObject({
        cardStyle: 'constelacion',
        dataVersion: 1,
        imagesVersion: 2,
        videoStatus: 'none',
      });
      expect(t.queue.jobs.map((j) => j.id)).toEqual([`images-${wrap.id}-1`, `images-${wrap.id}-2`]);
    });

    it('has no daily limit and works on a frozen year', async () => {
      const t = setup();
      let wrap = await publishAna(t);
      t.at('2027-03-01T12:00:00Z');
      wrap = await t.service.changeCard(wrap, 'cordillera');
      wrap = await t.service.changeCard(wrap, 'huella');
      expect(wrap.imagesVersion).toBe(3);
    });

    it('is not possible on a deleted wrap', async () => {
      const t = setup();
      const wrap = await publishAna(t);
      await t.service.remove(wrap);
      const deleted = await t.repo.findByOwner(4242, 2026);
      await expect(t.service.changeCard(deleted!, 'cordillera')).rejects.toBeInstanceOf(
        WrapDeletedError,
      );
    });
  });

  describe('remove', () => {
    it('drops the snapshot and the files, cancels pending renders, and answers 410 after', async () => {
      const t = setup();
      const wrap = await publishAna(t);
      await t.service.remove(wrap);
      const stored = await t.repo.findByOwner(4242, 2026);
      expect(stored).toMatchObject({
        status: 'deleted',
        snapshot: null,
        deletedAt: new Date('2026-03-01T12:00:00Z'),
      });
      expect(t.removedFiles).toEqual([wrap.id]);
      expect(t.queue.jobs.map((j) => j.state)).toEqual(['cancelled']);
      await expect(t.service.findPublic('ana-dev', 2026)).rejects.toBeInstanceOf(WrapDeletedError);
    });

    it('works on a frozen year', async () => {
      const t = setup();
      const wrap = await publishAna(t);
      t.at('2027-06-01T12:00:00Z');
      await expect(t.service.remove(wrap)).resolves.toBeUndefined();
    });

    it('lets the owner publish again, once a day after the last publication', async () => {
      const t = setup();
      const wrap = await publishAna(t);
      await t.service.remove(wrap);
      await expect(publishAna(t)).rejects.toBeInstanceOf(RegenerateTooSoonError);
      t.later(24);
      const back = await publishAna(t);
      expect(back).toMatchObject({
        id: wrap.id,
        status: 'published',
        dataVersion: 2,
        deletedAt: null,
      });
      expect(back.snapshot).not.toBeNull();
      await expect(t.service.findPublic('ana-dev', 2026)).resolves.toMatchObject({ moved: false });
    });
  });

  describe('retryImages', () => {
    it('queues failed images again', async () => {
      const t = setup();
      const wrap = await publishAna(t);
      const failed = await t.repo.update(wrap.id, { imagesStatus: 'failed' }, wrap);
      const retried = await t.service.retryImages(failed);
      expect(retried.imagesStatus).toBe('queued');
      expect(t.queue.retried).toEqual([`images-${wrap.id}-1`]);
    });

    it('does nothing for images that did not fail', async () => {
      const t = setup();
      const wrap = await publishAna(t);
      await expect(t.service.retryImages(wrap)).rejects.toBeInstanceOf(ImagesNotFailedError);
    });
  });

  describe('ownership and lookups', () => {
    it('gives the wrap to its owner only', async () => {
      const t = setup();
      await publishAna(t);
      await expect(t.service.findOwned(ana, 'ana-dev', 2026)).resolves.toMatchObject({
        githubUserId: 4242,
      });
      await expect(t.service.findOwned(beto, 'ana-dev', 2026)).rejects.toBeInstanceOf(
        NotOwnerError,
      );
      await expect(t.service.findOwned(ana, 'ana-dev', 2025)).rejects.toBeInstanceOf(
        WrapNotFoundError,
      );
    });

    it('never writes a wrap during a preview', async () => {
      const t = setup();
      await t.previews.preview('ana-dev');
      expect(await t.repo.findByOwner(4242, 2026)).toBeNull();
    });
  });
});
