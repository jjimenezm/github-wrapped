import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { formatNumber } from '@wrapped/shared';
import { LocaleService } from '../../core/i18n/locale.service';

/** How long the count takes; long enough to feel like a reveal, short enough to read the result. */
export const COUNT_UP_MS = 1400;

/** Fast at first, settling on the value: the ease-out-expo curve, exactly 1 at the end. */
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * A number that counts up from zero once, the surprise moment of the reveal. Screen readers
 * get the final value right away; people who prefer less motion see it without the count.
 */
@Component({
  selector: 'gw-count-up',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span aria-hidden="true">{{ shown() }}</span
    ><span class="gw-visually-hidden">{{ final() }}</span>`,
  styles: `
    :host {
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class CountUpComponent {
  readonly value = input.required<number>();

  private readonly locale = inject(LocaleService).locale;
  private readonly current = signal(0);

  protected readonly shown = computed(() =>
    formatNumber(Math.round(this.current()), this.locale()),
  );
  protected readonly final = computed(() => formatNumber(this.value(), this.locale()));

  constructor() {
    const view = isPlatformBrowser(inject(PLATFORM_ID)) ? inject(DOCUMENT).defaultView : null;

    effect((onCleanup) => {
      const target = this.value();
      const reduce = view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
      if (!view || reduce) {
        this.current.set(target);
        return;
      }
      let start: number | null = null;
      let frame = 0;
      const step = (now: number) => {
        start ??= now;
        const progress = Math.min(1, (now - start) / COUNT_UP_MS);
        this.current.set(target * easeOutExpo(progress));
        if (progress < 1) frame = view.requestAnimationFrame(step);
      };
      this.current.set(0);
      frame = view.requestAnimationFrame(step);
      onCleanup(() => view.cancelAnimationFrame(frame));
    });
  }
}
