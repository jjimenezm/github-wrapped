import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { formatNumber, periodLabel } from '@wrapped/shared';
import { LocaleService } from '../../core/i18n/locale.service';
import { PreviewStore } from '../../core/preview/preview.store';
import { WordmarkComponent } from '../../ui/wordmark/wordmark.component';

/** Stand-in for the slides until the Stories land: proves the lookup arrived, with a way back. */
@Component({
  selector: 'gw-slides-pending',
  imports: [RouterLink, TranslocoPipe, WordmarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bar"><gw-wordmark /></header>
    @if (snapshot(); as s) {
      <main class="body">
        <p class="login gw-mono">&#64;{{ s.login }}</p>
        <h1>
          <span class="gw-mono">{{ contributions() }}</span>
          {{ 'slides.pending.contributions' | transloco }}
        </h1>
        <p class="period">{{ period() }}</p>
        <a class="gw-button gw-button--secondary" routerLink="/">{{
          'slides.pending.back' | transloco
        }}</a>
      </main>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: var(--gw-screen-h);
    }
    .bar {
      display: flex;
      align-items: center;
      height: 64px;
      padding: var(--gw-space-2) var(--gw-space-5) 0;
    }
    .body {
      display: flex;
      flex: 1;
      flex-direction: column;
      justify-content: center;
      gap: var(--gw-space-3);
      padding: 0 var(--gw-space-6) var(--gw-space-12);
    }
    .login,
    .period {
      margin: 0;
      color: var(--gw-text-muted);
      font-size: var(--gw-text-sm);
    }
    h1 {
      margin: 0;
      font: 600 var(--gw-text-xl) / 1.2 var(--gw-font-sans);
      letter-spacing: var(--gw-tracking-snug);
    }
    h1 .gw-mono {
      display: block;
      font-size: var(--gw-text-display);
      letter-spacing: -0.04em;
      line-height: 1.05;
    }
    a {
      align-self: flex-start;
      margin-top: var(--gw-space-6);
    }
  `,
})
export class SlidesPendingComponent {
  private readonly locale = inject(LocaleService).locale;

  protected readonly snapshot = inject(PreviewStore).snapshot;
  protected readonly contributions = computed(() =>
    formatNumber(this.snapshot()?.metrics.contributions ?? 0, this.locale()),
  );
  protected readonly period = computed(() => {
    const s = this.snapshot();
    return s ? periodLabel(s.period, this.locale()) : '';
  });
}
