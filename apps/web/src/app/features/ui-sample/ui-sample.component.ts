import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { WrapPeriod, formatNumber, periodChip } from '@wrapped/shared';
import { LocaleSwitchComponent } from '../../core/i18n/locale-switch.component';
import { LocaleService } from '../../core/i18n/locale.service';
import { ChipComponent } from '../../ui/chip/chip.component';
import { GlassPanelComponent } from '../../ui/glass-panel/glass-panel.component';
import { GridLoaderComponent } from '../../ui/grid-loader/grid-loader.component';
import { IconButtonComponent } from '../../ui/icon-button/icon-button.component';
import { IconComponent } from '../../ui/icon/icon.component';
import { WordmarkComponent } from '../../ui/wordmark/wordmark.component';

const PERIOD: WrapPeriod = { year: 2026, from: '2026-01-01', to: '2026-11-03', complete: false };
const PREVIOUS: WrapPeriod = { year: 2025, from: '2025-01-01', to: '2025-11-03', complete: false };

const SWATCHES = [
  { key: 'ink', token: '--gw-ink' },
  { key: 'text', token: '--gw-text' },
  { key: 'muted', token: '--gw-text-muted' },
  { key: 'ice', token: '--gw-ice' },
  { key: 'growth', token: '--gw-growth' },
  { key: 'danger', token: '--gw-danger' },
] as const;

/** Internal page (dev builds only) to review the Frost primitives in both languages. */
@Component({
  selector: 'gw-ui-sample',
  imports: [
    TranslocoPipe,
    LocaleSwitchComponent,
    GlassPanelComponent,
    ChipComponent,
    IconComponent,
    IconButtonComponent,
    GridLoaderComponent,
    WordmarkComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-sample.component.html',
  styleUrl: './ui-sample.component.css',
})
export class UiSampleComponent {
  private readonly locale = inject(LocaleService).locale;

  protected readonly swatches = SWATCHES;
  protected readonly chip = computed(() => periodChip(PERIOD, this.locale()));
  protected readonly previousChip = computed(() => periodChip(PREVIOUS, this.locale()));
  protected readonly commits = computed(() => formatNumber(312, this.locale()));
  protected readonly contributions = computed(() => formatNumber(1284, this.locale()));
}
