import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { CardStyle, PublicWrap } from '@wrapped/shared';
import { ApiError } from '../../../core/api/api-error';
import { authUrl } from '../../../core/api/auth-url';
import { WrapApiService } from '../../../core/api/wrap-api.service';
import { ExternalNavigation } from '../../../core/browser/external-navigation';
import { wrapPath } from '../../../core/routing/wrap-url';
import { GridLoaderComponent } from '../../../ui/grid-loader/grid-loader.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { CardCarouselComponent } from './card-carousel.component';

const SAVE_ERRORS: Record<string, string> = {
  NOT_OWNER: 'notOwner',
  WRAP_DELETED: 'deleted',
  WRAP_NOT_FOUND: 'notFound',
};

/**
 * `/@login/year/card`: the same carousel, to change the card of a published wrap. With the
 * owner's session it saves right away; only an expired session goes back through GitHub,
 * which saves the card on the way back. It has no publishing copy: the wrap is already live.
 */
@Component({
  selector: 'gw-change-card',
  imports: [RouterLink, TranslocoPipe, CardCarouselComponent, GridLoaderComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-card.component.html',
  styleUrl: './change-card.component.css',
})
export class ChangeCardComponent {
  private readonly api = inject(WrapApiService);
  private readonly router = inject(Router);
  private readonly navigation = inject(ExternalNavigation);
  private readonly destroyRef = inject(DestroyRef);
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;

  protected readonly login = this.params.get('login') ?? '';
  protected readonly year = Number(this.params.get('year'));
  protected readonly wrap = signal<PublicWrap | null>(null);
  protected readonly loadFailed = signal(false);
  /** Null until the api answers; false sends the save through GitHub. */
  protected readonly signedIn = signal<boolean | null>(null);
  protected readonly selected = signal<CardStyle>('huella');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.api
      .publicWrap(this.login, this.year)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (wrap) => {
          this.wrap.set(wrap);
          this.selected.set(wrap.cardStyle);
        },
        error: () => this.loadFailed.set(true),
      });
    this.api
      .session()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: () => this.signedIn.set(true),
        error: () => this.signedIn.set(false),
      });
  }

  protected pick(style: CardStyle): void {
    this.selected.set(style);
    this.error.set(null);
  }

  protected save(): void {
    if (this.signedIn() === false) return this.continueWithGitHub();
    this.saving.set(true);
    this.error.set(null);
    this.api
      .changeCard(this.login, this.year, this.selected())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => void this.router.navigateByUrl(this.sharePath),
        error: (failure: ApiError) => {
          this.saving.set(false);
          if (failure.code === 'UNAUTHENTICATED') return this.continueWithGitHub();
          this.error.set(SAVE_ERRORS[failure.code] ?? 'failed');
        },
      });
  }

  protected get sharePath(): string {
    return wrapPath(this.login, this.year, 'share');
  }

  private continueWithGitHub(): void {
    this.navigation.go(
      authUrl({
        intent: 'change-card',
        login: this.login,
        style: this.selected(),
        year: this.year,
      }),
    );
  }
}
