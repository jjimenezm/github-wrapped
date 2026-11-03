import type { WrapSnapshot } from '@wrapped/shared';
import { ConcurrentUpdateError, WrapExistsError } from './wrap.errors';
import type { NewWrap, WrapsRepository } from './wraps.repository';

const snapshot = { login: 'ana-dev', metrics: { contributions: 285 } } as unknown as WrapSnapshot;

export const newWrap = (overrides: Partial<NewWrap> = {}): NewWrap => ({
  githubUserId: 4242,
  login: 'Ana-Dev',
  year: 2026,
  locale: 'es',
  cardStyle: 'huella',
  snapshot,
  status: 'published',
  dataVersion: 1,
  imagesVersion: 1,
  imagesReadyVersion: null,
  imagesStatus: 'queued',
  videoReadyVersion: null,
  videoStatus: 'none',
  publishedAt: new Date('2026-03-01T12:00:00Z'),
  regeneratedAt: new Date('2026-03-01T12:00:00Z'),
  deletedAt: null,
  ...overrides,
});

/**
 * The behavior every WrapsRepository must have. The in-memory one runs it in the unit tests and
 * the Prisma one against a real Postgres, so the e2e tests (in memory) prove what production does.
 */
export function describeWrapsRepository(
  name: string,
  setup: () => Promise<WrapsRepository>,
  teardown: () => Promise<void> = () => Promise.resolve(),
) {
  describe(`${name} (WrapsRepository contract)`, () => {
    let repo: WrapsRepository;
    beforeEach(async () => {
      repo = await setup();
    });
    afterAll(() => teardown());

    it('creates a wrap with an id and finds it by owner and year', async () => {
      const created = await repo.create(newWrap());
      expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(created.loginKey).toBe('ana-dev');
      expect(created.previousLoginKey).toBeNull();
      expect(await repo.findByOwner(4242, 2026)).toEqual(created);
      expect(await repo.findByOwner(4242, 2025)).toBeNull();
    });

    it('keeps the snapshot and the dates as they were written', async () => {
      const created = await repo.create(newWrap());
      const found = await repo.findByOwner(4242, 2026);
      expect(found?.snapshot).toEqual(snapshot);
      expect(found?.publishedAt.toISOString()).toBe('2026-03-01T12:00:00.000Z');
      expect(found).toEqual(created);
    });

    it('allows one wrap per person and year', async () => {
      await repo.create(newWrap());
      await expect(repo.create(newWrap({ login: 'other-name' }))).rejects.toBeInstanceOf(
        WrapExistsError,
      );
    });

    it('finds a wrap by login, ignoring case', async () => {
      const created = await repo.create(newWrap());
      expect(await repo.findByLogin('ana-dev', 2026)).toEqual({ wrap: created, moved: false });
      expect(await repo.findByLogin('nobody', 2026)).toBeNull();
    });

    it('follows a rename: the new login finds the wrap, the old one finds it as moved', async () => {
      await repo.create(newWrap());
      await repo.renameOwner(4242, 'Ana-Nueva');
      const current = await repo.findByLogin('ana-nueva', 2026);
      expect(current?.moved).toBe(false);
      expect(current?.wrap.login).toBe('Ana-Nueva');
      const old = await repo.findByLogin('ana-dev', 2026);
      expect(old).toEqual({ wrap: current?.wrap, moved: true });
    });

    it('updates when the versions are the ones the caller read', async () => {
      const created = await repo.create(newWrap());
      const updated = await repo.update(
        created.id,
        { dataVersion: 2, imagesVersion: 2, snapshot: null, status: 'deleted' },
        { dataVersion: 1, imagesVersion: 1 },
      );
      expect(updated).toMatchObject({
        dataVersion: 2,
        imagesVersion: 2,
        snapshot: null,
        status: 'deleted',
      });
      expect(await repo.findByOwner(4242, 2026)).toEqual(updated);
    });

    it('refuses an update based on versions someone else already changed', async () => {
      const created = await repo.create(newWrap());
      await repo.update(created.id, { imagesVersion: 2 }, { dataVersion: 1, imagesVersion: 1 });
      await expect(
        repo.update(created.id, { imagesVersion: 2 }, { dataVersion: 1, imagesVersion: 1 }),
      ).rejects.toBeInstanceOf(ConcurrentUpdateError);
    });
  });
}
