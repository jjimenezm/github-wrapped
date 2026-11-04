import { Inject, Injectable } from '@nestjs/common';
import {
  isRegenerable,
  normalizeLogin,
  resolveWrapPeriod,
  wrapImages,
  type CardStyle,
  type Locale,
  type PublicWrap,
  type WrapSnapshot,
  type WrapStatusView,
} from '@wrapped/shared';
import type { Identity } from '../auth/github-identity';
import { CLOCK, type Clock } from '../common/clock';
import { WRAP_FILES, type WrapFileStore } from '../files/wrap-files';
import { RENDER_QUEUE, type RenderQueue } from '../render/render-queue';
import { PreviewService } from './preview.service';
import {
  ConcurrentUpdateError,
  ImagesNotFailedError,
  NotOwnerError,
  RegenerateTooSoonError,
  WrapDeletedError,
  WrapExistsError,
  WrapNotFoundError,
  YearFrozenError,
} from './wrap.errors';
import {
  WRAPS_REPOSITORY,
  type WrapChanges,
  type WrapRecord,
  type WrapsRepository,
} from './wraps.repository';
import { InvalidLoginError } from './preview.errors';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The PNGs everyone links to: always the last version that finished, never one still rendering. */
const readyImages = (wrap: WrapRecord) =>
  wrap.imagesReadyVersion ? wrapImages(wrap.id, wrap.imagesReadyVersion) : null;

export interface PublishChoice {
  cardStyle: CardStyle;
  locale: Locale;
}

/**
 * The life of a wrap (R6, R9, R12): only the GitHub account it belongs to publishes, regenerates,
 * changes the card or deletes it. Publishing the same year again counts as a regeneration.
 */
@Injectable()
export class WrapsService {
  constructor(
    @Inject(WRAPS_REPOSITORY) private readonly repo: WrapsRepository,
    @Inject(RENDER_QUEUE) private readonly queue: RenderQueue,
    @Inject(WRAP_FILES) private readonly files: WrapFileStore,
    private readonly previews: PreviewService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async publish(identity: Identity, rawLogin: string, choice: PublishChoice): Promise<WrapRecord> {
    const login = normalizeLogin(rawLogin);
    if (!login) throw new InvalidLoginError();
    const snapshot = await this.previews.snapshotForPublish(login);
    if (snapshot.githubUserId !== identity.githubUserId) throw new NotOwnerError();

    const now = this.clock();
    const existing = await this.repo.findByOwner(identity.githubUserId, snapshot.period.year);
    if (existing) return this.republish(existing, snapshot, choice);

    try {
      const wrap = await this.repo.create({
        githubUserId: snapshot.githubUserId,
        login: snapshot.login,
        year: snapshot.period.year,
        locale: choice.locale,
        cardStyle: choice.cardStyle,
        snapshot,
        status: 'published',
        dataVersion: 1,
        imagesVersion: 1,
        imagesReadyVersion: null,
        imagesStatus: 'queued',
        videoReadyVersion: null,
        videoStatus: 'none',
        publishedAt: now,
        regeneratedAt: now,
        deletedAt: null,
      });
      await this.queue.enqueueImages(wrap.id, wrap.imagesVersion);
      return wrap;
    } catch (error) {
      if (!(error instanceof WrapExistsError)) throw error;
      // Another request published this year a moment ago: this one is a too-early republication.
      const created = await this.repo.findByOwner(identity.githubUserId, snapshot.period.year);
      if (!created) throw error;
      return this.republish(created, snapshot, choice);
    }
  }

  async regenerate(wrap: WrapRecord): Promise<WrapRecord> {
    if (wrap.status === 'deleted') throw new WrapDeletedError();
    this.assertRegenerable(wrap);
    const snapshot = await this.previews.fresh(wrap.loginKey);
    if (snapshot.githubUserId !== wrap.githubUserId) throw new NotOwnerError();
    await this.followRename(wrap, snapshot);
    const now = this.clock();
    const updated = await this.write(
      wrap,
      {
        snapshot,
        dataVersion: wrap.dataVersion + 1,
        imagesVersion: wrap.imagesVersion + 1,
        imagesStatus: 'queued',
        regeneratedAt: now,
      },
      () => new RegenerateTooSoonError(new Date(now.getTime() + DAY_MS)),
    );
    await this.queue.enqueueImages(updated.id, updated.imagesVersion);
    return updated;
  }

  /** New images only: no daily limit, allowed on a frozen year, and the video stays (R15). */
  async changeCard(wrap: WrapRecord, cardStyle: CardStyle): Promise<WrapRecord> {
    if (wrap.status === 'deleted') throw new WrapDeletedError();
    const updated = await this.write(wrap, {
      cardStyle,
      imagesVersion: wrap.imagesVersion + 1,
      imagesStatus: 'queued',
    });
    await this.queue.enqueueImages(updated.id, updated.imagesVersion);
    return updated;
  }

  /** The URL and QR answer 410 from now on; only what the 410 and the daily limit need remains. */
  async remove(wrap: WrapRecord): Promise<void> {
    if (wrap.status === 'deleted') return;
    await this.write(wrap, { status: 'deleted', snapshot: null, deletedAt: this.clock() });
    await this.files.remove(wrap.id);
    await this.queue.cancelWrap(wrap.id);
  }

  async retryImages(wrap: WrapRecord): Promise<WrapRecord> {
    if (wrap.status === 'deleted') throw new WrapDeletedError();
    if (wrap.imagesStatus !== 'failed') throw new ImagesNotFailedError();
    const updated = await this.write(wrap, { imagesStatus: 'queued' });
    await this.queue.retryImages(updated.id, updated.imagesVersion);
    return updated;
  }

  /** The public page's wrap; `moved` when the URL uses the login from before a rename. */
  async findPublic(rawLogin: string, year: number): Promise<{ wrap: WrapRecord; moved: boolean }> {
    const login = normalizeLogin(rawLogin);
    const found = login ? await this.repo.findByLogin(login, year) : null;
    if (!found) throw new WrapNotFoundError();
    if (found.wrap.status === 'deleted') throw new WrapDeletedError();
    return found;
  }

  /** A wrap its owner can act on (deleted ones included, to publish them again). */
  async findOwned(identity: Identity, rawLogin: string, year: number): Promise<WrapRecord> {
    const login = normalizeLogin(rawLogin);
    const found = login ? await this.repo.findByLogin(login, year) : null;
    if (!found) throw new WrapNotFoundError();
    if (found.wrap.githubUserId !== identity.githubUserId) throw new NotOwnerError();
    return found.wrap;
  }

  /** Keeps every wrap of a person under their current login after a GitHub rename. */
  syncLogin(identity: Identity): Promise<void> {
    return this.repo.renameOwner(identity.githubUserId, identity.login);
  }

  async status(wrap: WrapRecord): Promise<WrapStatusView> {
    return {
      imagesStatus: wrap.imagesStatus,
      imagesVersion: wrap.imagesVersion,
      imagesReadyVersion: wrap.imagesReadyVersion,
      videoStatus: wrap.videoStatus,
      videoReadyVersion: wrap.videoReadyVersion,
      queuePosition:
        wrap.imagesStatus === 'queued'
          ? await this.queue.imagesPosition(wrap.id, wrap.imagesVersion)
          : null,
      images: readyImages(wrap),
    };
  }

  publicView(wrap: WrapRecord): PublicWrap {
    if (!wrap.snapshot) throw new WrapDeletedError();
    return {
      login: wrap.login,
      year: wrap.year,
      locale: wrap.locale,
      cardStyle: wrap.cardStyle,
      snapshot: wrap.snapshot,
      publishedAt: wrap.publishedAt.toISOString(),
      imagesReadyVersion: wrap.imagesReadyVersion,
      images: readyImages(wrap),
      videoReadyVersion: wrap.videoReadyVersion,
      videoStatus: wrap.videoStatus,
    };
  }

  private async republish(
    existing: WrapRecord,
    snapshot: WrapSnapshot,
    choice: PublishChoice,
  ): Promise<WrapRecord> {
    this.assertRegenerable(existing);
    await this.followRename(existing, snapshot);
    const now = this.clock();
    const updated = await this.write(
      existing,
      {
        snapshot,
        locale: choice.locale,
        cardStyle: choice.cardStyle,
        status: 'published',
        deletedAt: null,
        publishedAt: existing.status === 'deleted' ? now : existing.publishedAt,
        dataVersion: existing.dataVersion + 1,
        imagesVersion: existing.imagesVersion + 1,
        imagesStatus: 'queued',
        regeneratedAt: now,
      },
      () => new RegenerateTooSoonError(new Date(now.getTime() + DAY_MS)),
    );
    await this.queue.enqueueImages(updated.id, updated.imagesVersion);
    return updated;
  }

  /** Regenerating: only the year in course (or last year, until January 31), once a day. */
  private assertRegenerable(wrap: WrapRecord) {
    const now = this.clock();
    if (!isRegenerable(wrap.year, now) || resolveWrapPeriod(now).year !== wrap.year) {
      throw new YearFrozenError(wrap.year);
    }
    const next = new Date(wrap.regeneratedAt.getTime() + DAY_MS);
    if (next > now) throw new RegenerateTooSoonError(next);
  }

  private async followRename(wrap: WrapRecord, snapshot: WrapSnapshot) {
    if (wrap.loginKey !== snapshot.login.toLowerCase()) {
      await this.repo.renameOwner(wrap.githubUserId, snapshot.login);
    }
  }

  /** Writes only if nobody changed the wrap since it was read. */
  private async write(
    wrap: WrapRecord,
    changes: WrapChanges,
    onConflict: () => Error = () => new ConcurrentUpdateError(),
  ): Promise<WrapRecord> {
    try {
      return await this.repo.update(wrap.id, changes, wrap);
    } catch (error) {
      throw error instanceof ConcurrentUpdateError ? onConflict() : error;
    }
  }
}
