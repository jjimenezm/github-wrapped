import { randomUUID } from 'node:crypto';
import type { CardStyle, ImagesStatus, Locale, VideoStatus, WrapSnapshot } from '@wrapped/shared';
import { ConcurrentUpdateError, WrapExistsError } from './wrap.errors';

export type WrapLifecycle = 'published' | 'deleted';

/** A wrap as stored. Ownership is the numeric GitHub id; the login is just its current name. */
export interface WrapRecord {
  id: string;
  githubUserId: number;
  login: string;
  /** Lowercase login, for lookups from URLs. */
  loginKey: string;
  /** The login before the last rename, so old links and QR codes can redirect. */
  previousLoginKey: string | null;
  year: number;
  locale: Locale;
  cardStyle: CardStyle;
  /** Null once deleted: only what the 410 and the limits need is kept. */
  snapshot: WrapSnapshot | null;
  status: WrapLifecycle;
  dataVersion: number;
  imagesVersion: number;
  imagesReadyVersion: number | null;
  imagesStatus: ImagesStatus;
  videoReadyVersion: number | null;
  videoStatus: VideoStatus;
  publishedAt: Date;
  /** Last publication or regeneration; deleting keeps it, so the daily limit survives a delete. */
  regeneratedAt: Date;
  deletedAt: Date | null;
}

export type NewWrap = Omit<WrapRecord, 'id' | 'loginKey' | 'previousLoginKey'>;
export type WrapChanges = Partial<Omit<WrapRecord, 'id' | 'githubUserId' | 'year' | 'loginKey'>>;
/** The versions the caller read; the update only applies if they are still current. */
export type ExpectedVersions = Pick<WrapRecord, 'dataVersion' | 'imagesVersion'>;

/** Wrap ids are UUIDs; anything else is answered as "not found" without touching storage. */
export const isWrapId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);

export interface WrapsRepository {
  create(wrap: NewWrap): Promise<WrapRecord>;
  findById(id: string): Promise<WrapRecord | null>;
  findByOwner(githubUserId: number, year: number): Promise<WrapRecord | null>;
  /** By current login, or by the previous one (`moved`), most recently changed first. */
  findByLogin(loginKey: string, year: number): Promise<{ wrap: WrapRecord; moved: boolean } | null>;
  update(id: string, changes: WrapChanges, expected: ExpectedVersions): Promise<WrapRecord>;
  /** The person renamed their GitHub account: every wrap follows, the old name is remembered. */
  renameOwner(githubUserId: number, login: string): Promise<void>;
}

export const WRAPS_REPOSITORY = Symbol('WRAPS_REPOSITORY');

const copy = (wrap: WrapRecord): WrapRecord => structuredClone(wrap);

/** For tests and local development without Postgres; it passes the same contract tests. */
export class InMemoryWrapsRepository implements WrapsRepository {
  private readonly wraps = new Map<string, WrapRecord>();
  private readonly order: string[] = [];

  create(data: NewWrap): Promise<WrapRecord> {
    if (
      [...this.wraps.values()].some(
        (w) => w.githubUserId === data.githubUserId && w.year === data.year,
      )
    ) {
      return Promise.reject(new WrapExistsError());
    }
    const wrap: WrapRecord = {
      ...structuredClone(data),
      id: randomUUID(),
      loginKey: data.login.toLowerCase(),
      previousLoginKey: null,
    };
    this.wraps.set(wrap.id, wrap);
    this.touch(wrap.id);
    return Promise.resolve(copy(wrap));
  }

  findById(id: string): Promise<WrapRecord | null> {
    const wrap = isWrapId(id) ? this.wraps.get(id) : undefined;
    return Promise.resolve(wrap ? copy(wrap) : null);
  }

  findByOwner(githubUserId: number, year: number): Promise<WrapRecord | null> {
    const wrap = [...this.wraps.values()].find(
      (w) => w.githubUserId === githubUserId && w.year === year,
    );
    return Promise.resolve(wrap ? copy(wrap) : null);
  }

  findByLogin(loginKey: string, year: number) {
    const key = loginKey.toLowerCase();
    const recentFirst = [...this.order].reverse().map((id) => this.wraps.get(id) as WrapRecord);
    const current = recentFirst.find((w) => w.year === year && w.loginKey === key);
    const moved = recentFirst.find((w) => w.year === year && w.previousLoginKey === key);
    const found = current ?? moved;
    return Promise.resolve(found ? { wrap: copy(found), moved: !current } : null);
  }

  update(id: string, changes: WrapChanges, expected: ExpectedVersions): Promise<WrapRecord> {
    const wrap = this.wraps.get(id);
    if (
      !wrap ||
      wrap.dataVersion !== expected.dataVersion ||
      wrap.imagesVersion !== expected.imagesVersion
    ) {
      return Promise.reject(new ConcurrentUpdateError());
    }
    Object.assign(wrap, structuredClone(changes));
    if (changes.login) wrap.loginKey = changes.login.toLowerCase();
    this.touch(id);
    return Promise.resolve(copy(wrap));
  }

  renameOwner(githubUserId: number, login: string): Promise<void> {
    const key = login.toLowerCase();
    for (const wrap of this.wraps.values()) {
      if (wrap.githubUserId !== githubUserId || wrap.loginKey === key) continue;
      wrap.previousLoginKey = wrap.loginKey;
      wrap.login = login;
      wrap.loginKey = key;
      this.touch(wrap.id);
    }
    return Promise.resolve();
  }

  private touch(id: string) {
    const at = this.order.indexOf(id);
    if (at >= 0) this.order.splice(at, 1);
    this.order.push(id);
  }
}
