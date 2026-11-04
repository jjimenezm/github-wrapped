import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';

/** Wraps the page and its slides; leaving both gives the visitor's own language back. */
@Component({
  selector: 'gw-public-wrap-shell',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class PublicWrapShellComponent {
  constructor() {
    const locale = inject(LocaleService);
    inject(DestroyRef).onDestroy(() => void locale.restore());
  }
}
