import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { resolveWrapPeriod } from '@wrapped/shared';
import { authUrl } from '../../core/api/auth-url';
import { WrapApiService } from '../../core/api/wrap-api.service';
import { ExternalNavigation } from '../../core/browser/external-navigation';
import { formatWait } from '../../core/i18n/format-wait';
import { formatDateTime } from '../../core/i18n/intl';
import { LocaleService } from '../../core/i18n/locale.service';
import { PreviewStore } from '../../core/preview/preview.store';
import { wrapPath } from '../../core/routing/wrap-url';
import { IconComponent } from '../../ui/icon/icon.component';
import { WordmarkComponent } from '../../ui/wordmark/wordmark.component';

/** How each `?oauth_error=` code reads; anything new reads as a failure that can be retried. */
const KINDS: Record<string, Kind> = {
  WRONG_ACCOUNT: 'wrongAccount',
  REGENERATE_TOO_SOON: 'tooSoon',
  YEAR_FROZEN: 'frozen',
  WRAP_NOT_FOUND: 'notFound',
  WRAP_DELETED: 'deleted',
  RATE_LIMITED: 'rateLimited',
  GITHUB_RATE_LIMITED: 'rateLimited',
};

type Kind =
  'wrongAccount' | 'tooSoon' | 'frozen' | 'notFound' | 'deleted' | 'rateLimited' | 'failed';

/** Kinds whose fix is waiting or nothing at all, so they link to the page already live. */
const SHOWS_PUBLIC_PAGE: readonly Kind[] = ['tooSoon', 'frozen'];
/** Kinds where trying again can work, given a card to publish. */
const RETRYABLE: readonly Kind[] = ['wrongAccount', 'rateLimited', 'failed'];

/**
 * Back from GitHub without a published wrap: says why, in the visitor's language, and always
 * leaves a way forward (retry, the page already published, or the start). Cancelling on
 * GitHub isn't an error: it goes straight back to the cards.
 */
@Component({
  selector: 'gw-oauth-return',
  imports: [RouterLink, TranslocoPipe, IconComponent, WordmarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './oauth-return.component.html',
  styleUrl: './oauth-return.component.css',
})
export class OAuthReturnComponent {
  private readonly api = inject(WrapApiService);
  private readonly navigation = inject(ExternalNavigation);
  private readonly store = inject(PreviewStore);
  private readonly locale = inject(LocaleService).locale;
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;

  private readonly code = this.query.get('oauth_error') ?? '';
  protected readonly login = this.query.get('login') ?? this.store.snapshot()?.login ?? '';
  protected readonly year =
    this.store.snapshot()?.period.year ?? resolveWrapPeriod(new Date()).year;
  protected readonly kind: Kind = KINDS[this.code] ?? 'failed';
  protected readonly publicPath = wrapPath(this.login, this.year);
  protected readonly showsPublicPage = SHOWS_PUBLIC_PAGE.includes(this.kind);
  protected readonly canRetry = RETRYABLE.includes(this.kind) && !!this.store.snapshot();
  protected readonly signedOut = signal(false);

  protected readonly params = computed(() => {
    const locale = this.locale();
    const retryAt = this.query.get('retry_at');
    const retryAfter = Number(this.query.get('retry_after'));
    return {
      login: this.login,
      year: this.year,
      when: retryAt ? formatDateTime(retryAt, locale) : '',
      wait: formatWait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60, locale),
    };
  });

  private readonly destroy = takeUntilDestroyed();

  constructor() {
    if (this.code === 'OAUTH_CANCELLED') {
      void inject(Router).navigateByUrl(this.store.snapshot() ? '/publish' : '/', {
        replaceUrl: true,
      });
    }
  }

  protected retry(): void {
    const snapshot = this.store.snapshot();
    if (!snapshot) return;
    this.navigation.go(
      authUrl({
        intent: 'publish',
        login: snapshot.login,
        style: this.store.style(),
        locale: this.locale(),
      }),
    );
  }

  protected signOut(): void {
    this.api
      .logout()
      .pipe(this.destroy)
      .subscribe({ next: () => this.signedOut.set(true), error: () => this.signedOut.set(true) });
  }
}
