import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { FALLBACK_PALETTE, liftForDark } from '@wrapped/art';
import type { LanguageShare } from '@wrapped/shared';
import { formatPercent } from '../../core/i18n/intl';
import { LocaleService } from '../../core/i18n/locale.service';

/** "Otros" is the rest of the bytes, not a language, so it stays a quiet gray. */
const OTHER_COLOR = 'rgb(255 255 255 / 0.22)';

interface Segment {
  name: string;
  bytes: number;
  color: string;
  /** Null for "Otros", which the legend names without a share. */
  share: string | null;
}

/** The top languages by bytes as one stacked bar, in GitHub's colors lifted for the dark. */
@Component({
  selector: 'gw-language-bar',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="lb-title">{{ 'slides.languages.title' | transloco }}</p>
    <div class="lb-bar" aria-hidden="true">
      @for (segment of segments(); track segment.name) {
        <span [style.flex-grow]="segment.bytes" [style.background]="segment.color"></span>
      }
    </div>
    <ul class="lb-legend">
      @for (segment of segments(); track segment.name) {
        <li>
          <i [style.background]="segment.color"></i>
          {{ segment.name }}
          @if (segment.share) {
            <span class="gw-mono">{{ segment.share }}</span>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    .lb-title {
      margin: 0;
      font-size: var(--gw-text-sm);
    }
    .lb-bar {
      display: flex;
      gap: 3px;
      height: 10px;
      margin-top: var(--gw-space-3);
    }
    .lb-bar span {
      flex-basis: 0;
      min-width: 4px;
      border-radius: 3px;
    }
    .lb-legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--gw-space-1) var(--gw-space-4);
      margin: var(--gw-space-3) 0 0;
      padding: 0;
      list-style: none;
      color: var(--gw-text-soft);
      font-size: var(--gw-text-xs);
    }
    .lb-legend li {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .lb-legend i {
      width: 9px;
      height: 9px;
      border-radius: 2px;
    }
    .lb-legend .gw-mono {
      color: var(--gw-text-muted);
    }
  `,
})
export class LanguageBarComponent {
  readonly languages = input.required<readonly LanguageShare[]>();
  readonly otherBytes = input(0);

  private readonly transloco = inject(TranslocoService);
  private readonly locale = inject(LocaleService).locale;

  protected readonly segments = computed((): Segment[] => {
    const locale = this.locale();
    const other = Math.max(0, this.otherBytes());
    const total = this.languages().reduce((sum, l) => sum + l.bytes, other);
    if (total <= 0) return [];
    const segments: Segment[] = this.languages().map((l) => ({
      name: l.name,
      bytes: l.bytes,
      color: l.color ? liftForDark(l.color) : FALLBACK_PALETTE[0],
      share: formatPercent(Math.round((l.bytes / total) * 100), locale),
    }));
    if (other > 0) {
      const name = this.transloco.translate('slides.languages.other', {}, locale);
      segments.push({ name, bytes: other, color: OTHER_COLOR, share: null });
    }
    return segments;
  });
}
