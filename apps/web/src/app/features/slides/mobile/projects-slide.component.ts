import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { formatNumber, type FeaturedRepo } from '@wrapped/shared';
import { LocaleService } from '../../../core/i18n/locale.service';
import { ChipComponent } from '../../../ui/chip/chip.component';
import { IconComponent } from '../../../ui/icon/icon.component';

/** Chips say what a repo is about: its topics, else its languages, at most three. */
const MAX_CHIPS = 3;

/** Slide 2: up to three repos with the most activity, only as many as there are (R4). */
@Component({
  selector: 'gw-projects-slide',
  imports: [TranslocoPipe, ChipComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-slide.component.html',
  styleUrl: './projects-slide.component.css',
})
export class ProjectsSlideComponent {
  readonly featured = input.required<readonly FeaturedRepo[]>();

  private readonly locale = inject(LocaleService).locale;

  protected readonly projects = computed(() =>
    this.featured().map((repo) => ({
      ...repo,
      chips: (repo.topics.length ? repo.topics : repo.languages).slice(0, MAX_CHIPS),
      starCount: formatNumber(repo.stars, this.locale()),
      commitCount: formatNumber(repo.commits, this.locale()),
    })),
  );
}
