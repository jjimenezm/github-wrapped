import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

export type ToastTone = 'neutral' | 'success';

/**
 * A short message floating near the bottom of the screen ("Enlace copiado"), over the content so
 * the layout never jumps. Always a status region, even hidden, so screen readers announce what
 * appears in it. Position it from the parent with `bottom`.
 */
@Component({
  selector: 'gw-toast',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'status',
    '[attr.data-visible]': 'visible() ? "" : null',
    '[attr.data-tone]': 'tone()',
  },
  template: `
    @if (visible()) {
      @if (tone() === 'success') {
        <gw-icon name="check" />
      }
      <ng-content />
    }
  `,
  styles: `
    :host {
      position: absolute;
      left: 50%;
      z-index: var(--gw-z-toast);
      display: flex;
      gap: var(--gw-space-2);
      align-items: center;
      width: max-content;
      max-width: calc(100% - 2 * var(--gw-space-6));
      padding: 10px var(--gw-space-4);
      border: 1px solid var(--gw-hair-strong);
      border-radius: var(--gw-radius-md);
      background: var(--gw-ink-raised);
      box-shadow: 0 12px 32px rgb(0 0 0 / 0.4);
      color: var(--gw-text);
      font-size: var(--gw-text-xs);
      line-height: 1.35;
      text-align: center;
      text-wrap: pretty;
      opacity: 0;
      transform: translate(-50%, 8px);
      pointer-events: none;
    }
    :host([data-visible]) {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    gw-icon {
      color: var(--gw-growth);
    }
    @media (prefers-reduced-motion: no-preference) {
      :host {
        transition:
          opacity var(--gw-dur) var(--gw-ease-out),
          transform var(--gw-dur) var(--gw-ease-out);
      }
    }
  `,
})
export class ToastComponent {
  readonly visible = input(false);
  readonly tone = input<ToastTone>('neutral');
}
