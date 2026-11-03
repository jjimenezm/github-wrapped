import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaRenderStore } from '../../src/images/prisma-render-store';
import { snapshot, WRAP_ID } from '../fixtures';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Integration tests need DATABASE_URL (a migrated, disposable Postgres)');

const prisma = new PrismaClient({ datasourceUrl: url });
const store = new PrismaRenderStore(prisma);

async function insertWrap(
  overrides: { imagesVersion?: number; status?: 'published' | 'deleted' } = {},
) {
  const now = new Date('2026-03-01T12:00:00Z');
  await prisma.wrap.create({
    data: {
      id: WRAP_ID,
      githubUserId: 4242,
      login: 'Ana-Dev',
      loginKey: 'ana-dev',
      year: 2026,
      locale: 'en',
      cardStyle: 'cordillera',
      snapshot: snapshot() as unknown as Prisma.InputJsonValue,
      status: overrides.status ?? 'published',
      dataVersion: 1,
      imagesVersion: overrides.imagesVersion ?? 1,
      imagesStatus: 'queued',
      videoStatus: 'none',
      publishedAt: now,
      regeneratedAt: now,
    },
  });
}

describe('PrismaRenderStore (real Postgres)', () => {
  beforeEach(() => prisma.$executeRaw`TRUNCATE TABLE wraps`);
  afterAll(() => prisma.$disconnect());

  it('reads what the worker needs to draw a wrap', async () => {
    await insertWrap();
    expect(await store.findForRender(WRAP_ID)).toEqual({
      id: WRAP_ID,
      login: 'Ana-Dev',
      year: 2026,
      locale: 'en',
      cardStyle: 'cordillera',
      snapshot: snapshot() as unknown as Prisma.InputJsonValue,
      status: 'published',
      imagesVersion: 1,
      imagesReadyVersion: null,
      imagesStatus: 'queued',
    });
    expect(await store.findForRender('not-a-uuid')).toBeNull();
  });

  it('moves the ready version forward only, and marks ready only the current version', async () => {
    await insertWrap({ imagesVersion: 2 });
    await store.markImagesReady(WRAP_ID, 1);
    expect(await store.findForRender(WRAP_ID)).toMatchObject({
      imagesReadyVersion: 1,
      imagesStatus: 'queued',
    });
    await store.markImagesReady(WRAP_ID, 2);
    expect(await store.findForRender(WRAP_ID)).toMatchObject({
      imagesReadyVersion: 2,
      imagesStatus: 'ready',
    });
    await store.markImagesReady(WRAP_ID, 1);
    expect((await store.findForRender(WRAP_ID))?.imagesReadyVersion).toBe(2);
  });

  it('marks failed only the version still asked for', async () => {
    await insertWrap({ imagesVersion: 2 });
    await store.markImagesFailed(WRAP_ID, 1);
    expect((await store.findForRender(WRAP_ID))?.imagesStatus).toBe('queued');
    await store.markImagesFailed(WRAP_ID, 2);
    expect((await store.findForRender(WRAP_ID))?.imagesStatus).toBe('failed');
  });

  it('lists published wraps only, and leaves deleted ones alone', async () => {
    await insertWrap({ status: 'deleted' });
    expect(await store.listPublished()).toEqual([]);
    await store.markImagesReady(WRAP_ID, 1);
    expect((await store.findForRender(WRAP_ID))?.imagesReadyVersion).toBeNull();
  });
});
