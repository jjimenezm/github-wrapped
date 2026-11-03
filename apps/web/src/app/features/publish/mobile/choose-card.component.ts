import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { authUrl } from '../../../core/api/auth-url';
import { ExternalNavigation } from '../../../core/browser/external-navigation';
import { LocaleService } from '../../../core/i18n/locale.service';
import { PreviewStore } from '../../../core/preview/preview.store';
import { wrapPath } from '../../../core/routing/wrap-url';
import { IconButtonComponent } from '../../../ui/icon-button/icon-button.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { CardCarouselComponent } from './card-carousel.component';

/**
 * `/publish`: pick one of the three cards and publish it with GitHub (R5, R6). GitHub only
 * confirms who the person is; the api checks they own the login before publishing anything.
 */
@Component({
  selector: 'gw-choose-card',
  imports: [TranslocoPipe, CardCarouselComponent, IconButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './choose-card.component.html',
  styleUrl: './choose-card.component.css',
})
export class ChooseCardComponent {
  private readonly router = inject(Router);
  private readonly navigation = inject(ExternalNavigation);

  protected readonly store = inject(PreviewStore);
  protected readonly locale = inject(LocaleService).locale;
  protected readonly wrapPath = wrapPath;

  protected publish(): void {
    const snapshot = this.store.snapshot();
    if (!snapshot) return;
    // The language is the one on screen now, which may differ from the browser's (R17).
    this.navigation.go(
      authUrl({
        intent: 'publish',
        login: snapshot.login,
        style: this.store.style(),
        locale: this.locale(),
      }),
    );
  }

  protected back(): void {
    void this.router.navigateByUrl('/slides');
  }
}
