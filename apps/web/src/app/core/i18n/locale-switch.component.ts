import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Locale } from '@wrapped/shared';
import { LocaleService } from './locale.service';

const OPTIONS: readonly { id: Locale; short: string }[] = [
  { id: 'es', short: 'ES' },
  { id: 'en', short: 'EN' },
];

/** ES/EN segmented control. Switching re-renders in place; nothing reloads. */
@Component({
  selector: 'gw-locale-switch',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="seg" role="group" [attr.aria-label]="'locale.label' | transloco">
      @for (option of options; track option.id) {
        <button
          type="button"
          [attr.lang]="option.id"
          [attr.aria-pressed]="locale() === option.id"
          (click)="choose(option.id)"
        >
          {{ option.short }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .seg {
      display: flex;
      padding: 3px;
      border: 1px solid var(--gw-hair);
      border-radius: var(--gw-radius-pill);
    }
    button {
      position: relative;
      min-width: var(--gw-hit);
      height: 32px;
      padding: 0 var(--gw-space-3);
      border: 0;
      border-radius: var(--gw-radius-pill);
      background: transparent;
      color: var(--gw-text-muted);
      font: 500 var(--gw-text-xs) / 1 var(--gw-font-sans);
      letter-spacing: 0.02em;
      cursor: pointer;
      touch-action: manipulation;
      transition:
        background-color var(--gw-dur-fast) var(--gw-ease-out),
        color var(--gw-dur-fast) var(--gw-ease-out);
    }
    /* Taller hit area without changing the visual size. */
    button::before {
      content: '';
      position: absolute;
      inset: -7px 0;
    }
    button:hover {
      color: var(--gw-text);
    }
    button[aria-pressed='true'] {
      background: var(--gw-glass-strong);
      color: var(--gw-text);
    }
  `,
})
export class LocaleSwitchComponent {
  private readonly locales = inject(LocaleService);
  protected readonly locale = this.locales.locale;
  protected readonly options = OPTIONS;

  protected choose(locale: Locale): void {
    void this.locales.use(locale);
  }
}
