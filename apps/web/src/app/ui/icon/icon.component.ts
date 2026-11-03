import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { OCTICONS, OcticonName } from './octicons';

/**
 * An Octicon at 16px, painted with `currentColor`. Decorative unless it gets a `label`;
 * size it with `--gw-icon-size`.
 */
@Component({
  selector: 'gw-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      focusable="false"
      [attr.aria-hidden]="label() ? null : 'true'"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label() || null"
    >
      @for (d of paths(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      width: var(--gw-icon-size, 16px);
      height: var(--gw-icon-size, 16px);
    }
    svg {
      width: 100%;
      height: 100%;
    }
  `,
})
export class IconComponent {
  readonly name = input.required<OcticonName>();
  readonly label = input<string>();
  protected readonly paths = computed(() => OCTICONS[this.name()]);
}
