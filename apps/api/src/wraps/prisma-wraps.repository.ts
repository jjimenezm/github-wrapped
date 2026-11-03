import type { OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient, type Wrap } from '@prisma/client';
import type { WrapSnapshot } from '@wrapped/shared';
import { ConcurrentUpdateError, WrapExistsError } from './wrap.errors';
import type {
  ExpectedVersions,
  NewWrap,
  WrapChanges,
  WrapRecord,
  WrapsRepository,
} from './wraps.repository';

/** Row to record, field by field, so a new column never leaks into the domain unnoticed. */
function toRecord(row: Wrap): WrapRecord {
  return {
    id: row.id,
    githubUserId: row.githubUserId,
    login: row.login,
    loginKey: row.loginKey,
    previousLoginKey: row.previousLoginKey,
    year: row.year,
    locale: row.locale,
    cardStyle: row.cardStyle,
    snapshot: row.snapshot as unknown as WrapSnapshot | null,
    status: row.status,
    dataVersion: row.dataVersion,
    imagesVersion: row.imagesVersion,
    imagesReadyVersion: row.imagesReadyVersion,
    imagesStatus: row.imagesStatus,
    videoReadyVersion: row.videoReadyVersion,
    videoStatus: row.videoStatus,
    publishedAt: row.publishedAt,
    regeneratedAt: row.regeneratedAt,
    deletedAt: row.deletedAt,
  };
}

/** A null JSON column must be written as Prisma.DbNull, not as JS null. */
function toData(changes: WrapChanges | NewWrap) {
  const { snapshot, ...rest } = changes;
  if (snapshot === undefined) return rest;
  return {
    ...rest,
    snapshot: snapshot === null ? Prisma.DbNull : (snapshot as unknown as Prisma.InputJsonValue),
  };
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** Postgres through Prisma; it passes the same contract tests as the in-memory repository. */
export class PrismaWrapsRepository implements WrapsRepository, OnModuleDestroy {
  constructor(readonly prisma: PrismaClient) {}

  async create(wrap: NewWrap): Promise<WrapRecord> {
    try {
      const row = await this.prisma.wrap.create({
        data: { ...toData(wrap), loginKey: wrap.login.toLowerCase() } as Prisma.WrapCreateInput,
      });
      return toRecord(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new WrapExistsError();
      throw error;
    }
  }

  async findByOwner(githubUserId: number, year: number): Promise<WrapRecord | null> {
    const row = await this.prisma.wrap.findUnique({
      where: { githubUserId_year: { githubUserId, year } },
    });
    return row ? toRecord(row) : null;
  }

  async findByLogin(loginKey: string, year: number) {
    const key = loginKey.toLowerCase();
    const recentFirst = { updatedAt: 'desc' } as const;
    const current = await this.prisma.wrap.findFirst({
      where: { loginKey: key, year },
      orderBy: recentFirst,
    });
    if (current) return { wrap: toRecord(current), moved: false };
    const moved = await this.prisma.wrap.findFirst({
      where: { previousLoginKey: key, year },
      orderBy: recentFirst,
    });
    return moved ? { wrap: toRecord(moved), moved: true } : null;
  }

  async update(id: string, changes: WrapChanges, expected: ExpectedVersions): Promise<WrapRecord> {
    const data = toData(changes) as Prisma.WrapUpdateManyMutationInput;
    if (changes.login) data.loginKey = changes.login.toLowerCase();
    const { count } = await this.prisma.wrap.updateMany({
      where: { id, dataVersion: expected.dataVersion, imagesVersion: expected.imagesVersion },
      data,
    });
    if (count === 0) throw new ConcurrentUpdateError();
    return toRecord(await this.prisma.wrap.findUniqueOrThrow({ where: { id } }));
  }

  async renameOwner(githubUserId: number, login: string): Promise<void> {
    // The previous key comes from each row, which a plain updateMany can't express.
    await this.prisma.$executeRaw`
      UPDATE wraps
      SET previous_login_key = login_key, login = ${login}, login_key = ${login.toLowerCase()}, updated_at = now()
      WHERE github_user_id = ${githubUserId} AND login_key <> ${login.toLowerCase()}`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
