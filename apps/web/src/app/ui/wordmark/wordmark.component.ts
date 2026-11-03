import { ChangeDetectionStrategy, Component } from '@angular/core';

/** The 3×3 contribution mark beside "wrapped"; the name is the product, so it isn't translated. */
@Component({
  selector: 'gw-wordmark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="wm-mark" aria-hidden="true">
      @for (cell of cells; track cell) {
        <span></span>
      }
    </span>
    wrapped`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      font: 600 var(--gw-text-lg) / 1 var(--gw-font-sans);
      letter-spacing: -0.02em;
    }

    .wm-mark {
      display: grid;
      grid-template-columns: repeat(3, 4px);
      gap: 2px;
    }

    .wm-mark span {
      width: 4px;
      height: 4px;
      border-radius: 1px;
      background: currentColor;
    }

    .wm-mark span:nth-child(2n) {
      opacity: 0.45;
    }
  `,
})
export class WordmarkComponent {
  protected readonly cells = [0, 1, 2, 3, 4, 5, 6, 7, 8];
}
