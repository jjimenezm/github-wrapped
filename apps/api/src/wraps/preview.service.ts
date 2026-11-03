import { Inject, Injectable } from '@nestjs/common';
import { normalizeLogin, resolveWrapPeriod, type WrapSnapshot } from '@wrapped/shared';
import { CLOCK, type Clock } from '../common/clock';
import { STORE, type KeyValueStore } from '../common/store';
import { SnapshotBuilder } from '../github/snapshot.builder';
import { InvalidLoginError } from './preview.errors';

const FULL_TTL_SECONDS = 60 * 60;
/** A snapshot with a part missing expires fast, so a passing GitHub hiccup doesn't stick. */
const PARTIAL_TTL_SECONDS = 90;

interface CachedPreview {
  snapshot: WrapSnapshot;
  complete: boolean;
}

/**
 * The lookup before publishing (R18): nothing is stored beyond a short-lived cache, keyed by the
 * normalized login and the period, so a viral post costs GitHub one query per person per hour.
 */
@Injectable()
export class PreviewService {
  /** Concurrent lookups of the same person share one trip to GitHub. */
  private readonly inFlight = new Map<string, Promise<CachedPreview>>();

  constructor(
    private readonly builder: SnapshotBuilder,
    @Inject(STORE) private readonly store: KeyValueStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async preview(rawLogin: string): Promise<WrapSnapshot> {
    const login = normalizeLogin(rawLogin);
    if (!login) throw new InvalidLoginError();
    return (await this.cachedOrBuilt(login)).snapshot;
  }

  /** The snapshot to freeze when publishing: the cached one only if nothing in it failed. */
  async snapshotForPublish(login: string): Promise<WrapSnapshot> {
    const found = await this.cachedOrBuilt(login);
    return found.complete ? found.snapshot : (await this.build(login)).snapshot;
  }

  /** Straight from GitHub, for a regeneration (and the cache is refreshed with it). */
  async fresh(login: string): Promise<WrapSnapshot> {
    return (await this.build(login)).snapshot;
  }

  private key(login: string) {
    const period = resolveWrapPeriod(this.clock());
    return `preview:${login}:${period.from}..${period.to}`;
  }

  private async cachedOrBuilt(login: string): Promise<CachedPreview> {
    const cached = await this.store.get(this.key(login));
    return cached ? (JSON.parse(cached) as CachedPreview) : this.build(login);
  }

  private build(login: string): Promise<CachedPreview> {
    const key = this.key(login);
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const lookup = this.builder
      .build(login, this.clock())
      .then(async (built) => {
        const ttl = built.complete ? FULL_TTL_SECONDS : PARTIAL_TTL_SECONDS;
        await this.store.set(key, JSON.stringify(built), ttl);
        return built;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, lookup);
    return lookup;
  }
}
