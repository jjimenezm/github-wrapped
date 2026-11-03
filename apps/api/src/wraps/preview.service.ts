import { Inject, Injectable } from '@nestjs/common';
import { normalizeLogin, resolveWrapPeriod, type WrapSnapshot } from '@wrapped/shared';
import { CLOCK, type Clock } from '../common/clock';
import { STORE, type KeyValueStore } from '../common/store';
import { SnapshotBuilder } from '../github/snapshot.builder';
import { InvalidLoginError } from './preview.errors';

const FULL_TTL_SECONDS = 60 * 60;
/** A snapshot with a part missing expires fast, so a passing GitHub hiccup doesn't stick. */
const PARTIAL_TTL_SECONDS = 90;

/**
 * The lookup before publishing (R18): nothing is stored beyond a short-lived cache, keyed by the
 * normalized login and the period, so a viral post costs GitHub one query per person per hour.
 */
@Injectable()
export class PreviewService {
  /** Concurrent lookups of the same person share one trip to GitHub. */
  private readonly inFlight = new Map<string, Promise<WrapSnapshot>>();

  constructor(
    private readonly builder: SnapshotBuilder,
    @Inject(STORE) private readonly store: KeyValueStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async preview(rawLogin: string): Promise<WrapSnapshot> {
    const login = normalizeLogin(rawLogin);
    if (!login) throw new InvalidLoginError();
    const now = this.clock();
    const period = resolveWrapPeriod(now);
    const key = `preview:${login}:${period.from}..${period.to}`;

    const cached = await this.store.get(key);
    if (cached) return JSON.parse(cached) as WrapSnapshot;

    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const lookup = this.lookup(login, now, key).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, lookup);
    return lookup;
  }

  private async lookup(login: string, now: Date, key: string): Promise<WrapSnapshot> {
    const { snapshot, complete } = await this.builder.build(login, now);
    await this.store.set(
      key,
      JSON.stringify(snapshot),
      complete ? FULL_TTL_SECONDS : PARTIAL_TTL_SECONDS,
    );
    return snapshot;
  }
}
