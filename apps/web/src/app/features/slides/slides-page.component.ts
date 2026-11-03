import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PreviewStore } from '../../core/preview/preview.store';
import { StoriesComponent } from './mobile/stories.component';

/** Where the slides hand over: choosing a card and publishing. */
export const PUBLISH_PATH = '/publish';

/** `/slides`: the year just looked up, as Stories. */
@Component({
  selector: 'gw-slides-page',
  imports: [StoriesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (snapshot(); as s) {
      <gw-stories [snapshot]="s" (finished)="choose()" />
    }
  `,
})
export class SlidesPageComponent {
  private readonly router = inject(Router);

  protected readonly snapshot = inject(PreviewStore).snapshot;

  protected choose(): void {
    void this.router.navigateByUrl(PUBLISH_PATH);
  }
}
