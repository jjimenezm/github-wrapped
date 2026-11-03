import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { OcticonName } from '../icon/octicons';

export type IconButtonVariant = 'glass' | 'ghost';

/** A round 44px button with one Octicon. `label` is its accessible name, so it is required. */
@Component({
  selector: 'gw-icon-button',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="ib"
      [attr.data-variant]="variant()"
      [attr.aria-label]="label()"
      [disabled]="disabled()"
      (click)="press.emit()"
    >
      <gw-icon [name]="icon()" />
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .ib {
      display: grid;
      place-items: center;
      width: var(--gw-hit);
      height: var(--gw-hit);
      padding: 0;
      border: 1px solid var(--gw-hair);
      border-radius: var(--gw-radius-pill);
      background: var(--gw-glass);
      color: var(--gw-text);
      cursor: pointer;
      -webkit-backdrop-filter: var(--gw-blur);
      backdrop-filter: var(--gw-blur);
      touch-action: manipulation;
      transition:
        background-color var(--gw-dur-fast) var(--gw-ease-out),
        border-color var(--gw-dur-fast) var(--gw-ease-out),
        transform var(--gw-dur-fast) var(--gw-ease-out);
    }
    .ib[data-variant='ghost'] {
      border-color: transparent;
      background: transparent;
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
    .ib:hover:not(:disabled) {
      border-color: var(--gw-hair-strong);
      background: var(--gw-glass-strong);
    }
    .ib:active:not(:disabled) {
      transform: scale(0.94);
    }
    .ib:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    @media (prefers-reduced-motion: reduce) {
      .ib:active:not(:disabled) {
        transform: none;
      }
    }
  `,
})
export class IconButtonComponent {
  readonly icon = input.required<OcticonName>();
  readonly label = input.required<string>();
  readonly variant = input<IconButtonVariant>('glass');
  readonly disabled = input(false);
  readonly press = output<void>();
}
