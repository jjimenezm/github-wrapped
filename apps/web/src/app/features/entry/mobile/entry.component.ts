import {
  ChangeDetectionStrategy,
  Component,
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
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { normalizeLogin, type WrapSnapshot } from '@wrapped/shared';
import { Subscription, catchError, forkJoin, map, of, timer } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { WrapApiService } from '../../../core/api/wrap-api.service';
import { formatWait } from '../../../core/i18n/format-wait';
import { LocaleSwitchComponent } from '../../../core/i18n/locale-switch.component';
import { LocaleService } from '../../../core/i18n/locale.service';
import { PreviewStore } from '../../../core/preview/preview.store';
import { IconComponent } from '../../../ui/icon/icon.component';
import { WordmarkComponent } from '../../../ui/wordmark/wordmark.component';
import { ENTRY_ART_SVG } from '../entry-art';
import { LoadingComponent, MESSAGE_INTERVAL_MS } from './loading.component';

/** Where the slides live (U9). */
export const REVEAL_PATH = '/slides';

/** Used when a rate limit comes back without saying how long to wait. */
const DEFAULT_WAIT_SECONDS = 60;

/**
 * What the person sees under the field. `error` is about what they typed (the field turns red);
 * `wait` is about GitHub or the network, so it offers a retry, after `retryAfter` seconds if set.
 */
interface Feedback {
  key: string;
  tone: 'error' | 'wait';
  retryAfter?: number;
}

const error = (key: string): Feedback => ({ key, tone: 'error' });
const wait = (key: string, retryAfter?: number): Feedback => ({ key, tone: 'wait', retryAfter });

function feedbackFor(failure: ApiError): Feedback {
  switch (failure.code) {
    case 'INVALID_LOGIN':
      return error('invalid');
    case 'USER_NOT_FOUND':
      return error('notFound');
    case 'RATE_LIMITED':
      return wait('rateLimited', failure.retryAfter ?? DEFAULT_WAIT_SECONDS);
    case 'GITHUB_RATE_LIMITED':
      return wait('githubRateLimited', failure.retryAfter ?? DEFAULT_WAIT_SECONDS);
    case 'GITHUB_UNAVAILABLE':
      return wait('githubUnavailable');
    case 'NETWORK':
      return wait('network');
    default:
      return wait('unknown');
  }
}

type Lookup = { ok: true; snapshot: WrapSnapshot } | { ok: false; failure: ApiError };

/** Screen 1, then screen 2 in its place: one field, the lookup and its outcome (R1, R2). */
@Component({
  selector: 'gw-entry',
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    IconComponent,
    LocaleSwitchComponent,
    LoadingComponent,
    WordmarkComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './entry.component.html',
  styleUrl: './entry.component.css',
})
export class EntryComponent {
  private readonly api = inject(WrapApiService);
  private readonly store = inject(PreviewStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly locale = inject(LocaleService).locale;
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  private pending: Subscription | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly form = new FormGroup({ login: new FormControl('', { nonNullable: true }) });
  protected readonly loading = signal(false);
  protected readonly login = signal('');
  protected readonly feedback = signal<Feedback | null>(null);
  protected readonly retryReady = signal(true);
  protected readonly waitText = computed(() => {
    const seconds = this.feedback()?.retryAfter;
    return seconds === undefined ? '' : formatWait(seconds, this.locale());
  });
  // Our own constant markup from packages/art; Angular's sanitizer would strip the SVG.
  protected readonly art = inject(DomSanitizer).bypassSecurityTrustHtml(ENTRY_ART_SVG);

  constructor() {
    this.form.controls.login.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.show(null));
    inject(DestroyRef).onDestroy(() => {
      this.pending?.unsubscribe();
      clearTimeout(this.retryTimer);
    });
  }

  protected submit(): void {
    const raw = this.form.controls.login.value;
    if (!raw.trim()) return this.show(error('empty'));
    const login = normalizeLogin(raw);
    if (!login) return this.show(error('invalid'));
    this.lookUp(login);
  }

  protected focusField(event: PointerEvent): void {
    const input = this.field()?.nativeElement;
    if (!input || event.target === input) return;
    event.preventDefault();
    input.focus();
  }

  protected cancel(): void {
    this.pending?.unsubscribe();
    this.backToForm();
  }

  private lookUp(login: string): void {
    this.show(null);
    this.login.set(login);
    this.loading.set(true);
    const lookup$ = this.api.preview(login).pipe(
      map((snapshot): Lookup => ({ ok: true, snapshot })),
      catchError((failure: unknown) => of<Lookup>({ ok: false, failure: ApiError.from(failure) })),
    );
    // Even a fast answer waits out the first message, so the loader never just flickers.
    this.pending = forkJoin([lookup$, timer(MESSAGE_INTERVAL_MS)]).subscribe(([result]) => {
      if (result.ok) {
        this.store.set(result.snapshot);
        void this.router.navigateByUrl(REVEAL_PATH);
      } else {
        this.backToForm();
        this.show(feedbackFor(result.failure));
      }
    });
  }

  private backToForm(): void {
    this.loading.set(false);
    afterNextRender(() => this.field()?.nativeElement.focus(), { injector: this.injector });
  }

  private show(feedback: Feedback | null): void {
    clearTimeout(this.retryTimer);
    this.feedback.set(feedback);
    const seconds = feedback?.retryAfter ?? 0;
    this.retryReady.set(seconds === 0);
    if (seconds > 0) {
      this.retryTimer = setTimeout(() => this.retryReady.set(true), seconds * 1000);
    }
  }
}
