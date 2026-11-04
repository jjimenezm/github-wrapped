import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { StoriesComponent } from '../slides/mobile/stories.component';
import type { PublicPage } from './public-wrap.resolver';

/** `/@login/year/slides`: the published year as Stories, read-only; the last step goes back. */
@Component({
  selector: 'gw-wrap-slides',
  imports: [StoriesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (wrap(); as w) {
      <gw-stories [snapshot]="w.snapshot" finishLabel="slides.backToCard" (finished)="back()" />
    }
  `,
})
export class WrapSlidesComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly page = toSignal(
    (this.route.parent ?? this.route).data.pipe(map((data) => data['page'] as PublicPage)),
    { requireSync: true },
  );

  protected readonly wrap = computed(() => {
    const page = this.page();
    return page.kind === 'wrap' ? page.wrap : null;
  });

  constructor() {
    // Without a wrap there is nothing to read; the page explains why.
    if (!this.wrap()) this.back();
  }

  protected back(): void {
    void this.router.navigate(['..'], { relativeTo: this.route });
  }
}
