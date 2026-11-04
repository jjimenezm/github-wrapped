import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { renderCard } from '@wrapped/art';
import { shareText, type PublicWrap, type WrapStatusView } from '@wrapped/shared';
import {
  Subscription,
  concat,
  defer,
  ignoreElements,
  repeat,
  retry,
  takeWhile,
  throwError,
  timer,
} from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { authUrl } from '../../../core/api/auth-url';
import { WrapApiService } from '../../../core/api/wrap-api.service';
import { ExternalNavigation } from '../../../core/browser/external-navigation';
import { PUBLIC_BASE_URL } from '../../../core/config/public-base-url';
import type { DeletedNotice } from '../../../core/routing/notice';
import { wrapPath } from '../../../core/routing/wrap-url';
import { GridLoaderComponent } from '../../../ui/grid-loader/grid-loader.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { ToastComponent } from '../../../ui/toast/toast.component';
import { DeleteConfirmComponent } from '../delete-confirm.component';
import { QrFullscreenComponent } from '../qr-fullscreen.component';
import {
  ShareActionsComponent,
  type ImagesState,
  type ShareIntents,
} from './share-actions.component';

/** How often the screen asks whether the images of the current version are ready. */
export const STATUS_POLL_MS = 2_000;

type View = 'loading' | 'ready' | 'gate' | 'gone' | 'failed';
type CopyState = 'idle' | 'copied' | 'manual';

const rendering = (status: WrapStatusView) =>
  status.imagesStatus !== 'failed' && status.imagesReadyVersion !== status.imagesVersion;

/** Answers that polling again won't change: the screen shows them instead. */
const PERMANENT = new Set(['UNAUTHENTICATED', 'NOT_OWNER', 'WRAP_DELETED', 'WRAP_NOT_FOUND']);

/**
 * `/@login/year/share`, the end of the journey (R7): the chosen card, its link, the ways to share
 * it and the way to delete it. Only the owner gets here; another session confirms with GitHub
 * first. Imagen, LinkedIn and X wait for the PNGs of the version on screen.
 */
@Component({
  selector: 'gw-share',
  imports: [
    RouterLink,
    TranslocoPipe,
    GridLoaderComponent,
    IconComponent,
    DeleteConfirmComponent,
    QrFullscreenComponent,
    ShareActionsComponent,
    ToastComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './share.component.html',
  styleUrl: './share.component.css',
})
export class ShareComponent {
  private readonly api = inject(WrapApiService);
  private readonly router = inject(Router);
  private readonly navigation = inject(ExternalNavigation);
  private readonly document = inject(DOCUMENT);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly baseUrl = inject(PUBLIC_BASE_URL);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;
  private readonly copyButton = viewChild<ElementRef<HTMLButtonElement>>('copyButton');
  private readonly deleteButton = viewChild<ElementRef<HTMLButtonElement>>('deleteButton');
  private readonly actions = viewChild(ShareActionsComponent);

  private polling: Subscription | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly login = this.params.get('login') ?? '';
  protected readonly year = Number(this.params.get('year'));
  protected readonly cardPath = wrapPath(this.login, this.year, 'card');

  protected readonly wrap = signal<PublicWrap | null>(null);
  protected readonly status = signal<WrapStatusView | null>(null);
  private readonly loadError = signal<'gone' | 'failed' | null>(null);
  private readonly denied = signal(false);

  protected readonly copyState = signal<CopyState>('idle');
  protected readonly retrying = signal(false);
  protected readonly retryError = signal(false);
  protected readonly qrOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  protected readonly view = computed<View>(() => {
    const failure = this.loadError();
    if (failure) return failure;
    if (this.denied()) return 'gate';
    return this.wrap() && this.status() ? 'ready' : 'loading';
  });

  protected readonly images = computed<ImagesState>(() => {
    const status = this.status();
    if (status?.imagesStatus === 'failed') return 'failed';
    return status?.images && !rendering(status) ? 'ready' : 'pending';
  });

  protected readonly publicUrl = computed(() => {
    const wrap = this.wrap();
    return wrap ? `${this.baseUrl}${wrapPath(wrap.login, wrap.year)}` : '';
  });
  protected readonly displayUrl = computed(() => this.publicUrl().replace(/^https?:\/\//, ''));

  // Our own markup from packages/art, which escapes every text it prints; the sanitizer would
  // strip the SVG. Drawn here, not the PNG, so the card shows while its images still render.
  protected readonly card = computed(() => {
    const wrap = this.wrap();
    if (!wrap) return null;
    return this.sanitizer.bypassSecurityTrustHtml(
      renderCard(wrap.snapshot, {
        style: wrap.cardStyle,
        locale: wrap.locale,
        format: 'portrait',
        publicBaseUrl: this.baseUrl,
        qr: 'code',
        animated: true,
      }),
    );
  });

  /** Intents carry the wrap's language, not the screen's: it is the wrap people will open. */
  protected readonly intents = computed((): ShareIntents | null => {
    const wrap = this.wrap();
    if (!wrap) return null;
    const url = encodeURIComponent(this.publicUrl());
    return {
      x: `https://x.com/intent/post?text=${encodeURIComponent(shareText(wrap.snapshot, wrap.locale))}&url=${url}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    };
  });

  protected readonly fileName = `github-wrapped-${this.login}-${this.year}.png`;

  constructor() {
    this.load();
    this.destroyRef.onDestroy(() => clearTimeout(this.copyTimer));
  }

  protected load(): void {
    this.loadError.set(null);
    this.api
      .publicWrap(this.login, this.year)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (wrap) => this.wrap.set(wrap),
        error: (failure: ApiError) =>
          this.loadError.set(
            failure.code === 'WRAP_DELETED' || failure.code === 'WRAP_NOT_FOUND'
              ? 'gone'
              : 'failed',
          ),
      });
    this.watchStatus();
  }

  /** Polls until the images of the current version are ready or failed; network hiccups retry. */
  private watchStatus(delay = 0): void {
    this.polling?.unsubscribe();
    const status$ = defer(() => this.api.status(this.login, this.year)).pipe(
      repeat({ delay: STATUS_POLL_MS }),
      takeWhile(rendering, true),
      retry({
        delay: (failure: ApiError) =>
          PERMANENT.has(failure.code) ? throwError(() => failure) : timer(STATUS_POLL_MS * 2),
      }),
    );
    this.polling = concat(timer(delay).pipe(ignoreElements()), status$)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => this.status.set(status),
        error: (failure: ApiError) => {
          if (failure.code === 'UNAUTHENTICATED' || failure.code === 'NOT_OWNER') {
            this.denied.set(true);
          }
        },
      });
  }

  protected manage(): void {
    this.navigation.go(authUrl({ intent: 'manage', login: this.login, year: this.year }));
  }

  protected async copy(): Promise<void> {
    const url = this.publicUrl();
    const copied = (await this.writeClipboard(url)) || this.copyThroughField(url);
    this.copyState.set(copied ? 'copied' : 'manual');
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copyState.set('idle'), copied ? 2_000 : 6_000);
  }

  private writeClipboard(text: string): Promise<boolean> {
    const clipboard = this.document.defaultView?.navigator.clipboard;
    if (!clipboard) return Promise.resolve(false);
    return clipboard.writeText(text).then(
      () => true,
      () => false,
    );
  }

  /** Older browsers and some webviews: a hidden field and the legacy copy command. */
  private copyThroughField(text: string): boolean {
    const field = this.document.createElement('textarea');
    field.value = text;
    field.readOnly = true;
    field.className = 'gw-visually-hidden';
    this.document.body.append(field);
    field.focus();
    field.select();
    try {
      return this.document.execCommand?.('copy') ?? false;
    } catch {
      return false;
    } finally {
      field.remove();
      this.copyButton()?.nativeElement.focus();
    }
  }

  protected retryImages(): void {
    this.retrying.set(true);
    this.retryError.set(false);
    this.api
      .retryImages(this.login, this.year)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => {
          this.retrying.set(false);
          this.status.set(status);
          this.watchStatus(STATUS_POLL_MS);
        },
        error: (failure: ApiError) => {
          this.retrying.set(false);
          if (failure.code === 'UNAUTHENTICATED') return this.manage();
          this.retryError.set(true);
        },
      });
  }

  protected openQr(): void {
    this.qrOpen.set(true);
  }

  protected closeQr(): void {
    this.qrOpen.set(false);
    afterNextRender(() => this.actions()?.focusQr(), { injector: this.injector });
  }

  protected openDelete(): void {
    this.deleteError.set(null);
    this.deleteOpen.set(true);
  }

  protected closeDelete(): void {
    this.deleteOpen.set(false);
    afterNextRender(() => this.deleteButton()?.nativeElement.focus(), { injector: this.injector });
  }

  protected confirmDelete(): void {
    this.deleting.set(true);
    this.deleteError.set(null);
    this.api
      .deleteWrap(this.login, this.year)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.leaveDeleted(),
        error: (failure: ApiError) => {
          this.deleting.set(false);
          if (failure.code === 'UNAUTHENTICATED') return this.manage();
          if (failure.code === 'WRAP_DELETED') return this.leaveDeleted();
          this.deleteError.set('failed');
        },
      });
  }

  /** Back to the entry, replacing this screen: going back must not land on a deleted wrap. */
  private leaveDeleted(): void {
    const state: DeletedNotice = { notice: 'deleted', year: this.year };
    void this.router.navigateByUrl('/', { state, replaceUrl: true });
  }
}
