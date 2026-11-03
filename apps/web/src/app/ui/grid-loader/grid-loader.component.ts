import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Delay step per cell (row + column), so the pulse travels diagonally across the grid. */
const STEPS = [0, 1, 2, 1, 2, 3, 2, 3, 4];

/**
 * 3×3 loader in pure CSS. Without a `label` it is decorative (the screen announces progress);
 * with one it becomes a status. Cells only animate when the user allows motion.
 */
@Component({
  selector: 'gw-grid-loader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.role]': 'label() ? "status" : null',
    '[attr.aria-hidden]': 'label() ? null : "true"',
  },
  template: `
    <span class="gl-grid" aria-hidden="true">
      @for (step of steps; track $index) {
        <span class="gl-cell" [style.--gl-step]="step"></span>
      }
    </span>
    @if (label()) {
      <span class="gw-visually-hidden">{{ label() }}</span>
    }
  `,
  styles: `
    :host {
      --gl-cell: 12px;
      --gl-gap: 7px;
      display: inline-flex;
      color: var(--gw-ice);
    }
    .gl-grid {
      display: grid;
      grid-template-columns: repeat(3, var(--gl-cell));
      gap: var(--gl-gap);
    }
    .gl-cell {
      width: var(--gl-cell);
      height: var(--gl-cell);
      border-radius: calc(var(--gl-cell) / 4);
      background: currentColor;
      opacity: calc(0.9 - var(--gl-step) * 0.15);
    }
    @media (prefers-reduced-motion: no-preference) {
      .gl-cell {
        animation-name: gl-pulse;
        animation-duration: 1.25s;
        animation-timing-function: var(--gw-ease-in-out);
        animation-delay: calc(var(--gl-step) * 100ms);
        animation-iteration-count: infinite;
        animation-fill-mode: both;
      }
    }
    @keyframes gl-pulse {
      0%,
      100% {
        opacity: 0.18;
        transform: scale(0.72);
      }
      50% {
        opacity: 1;
        transform: scale(1);
      }
    }
  `,
})
export class GridLoaderComponent {
  readonly label = input<string>();
  protected readonly steps = STEPS;
}
