import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** `ready` adds the green dot, the only place green means "done"; the text still says it. */
export type ChipTone = 'neutral' | 'ready';

/** A hairline pill for short context: a period, a state, a count. */
@Component({
  selector: 'gw-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-tone]': 'tone()' },
  template: `
    @if (tone() === 'ready') {
      <span class="chip-dot" aria-hidden="true"></span>
    }
    <ng-content />
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--gw-space-2);
      height: 28px;
      padding: 0 var(--gw-space-3);
      border: 1px solid var(--gw-hair);
      border-radius: var(--gw-radius-pill);
      color: var(--gw-text-muted);
      font: 500 var(--gw-text-xs) / 1 var(--gw-font-sans);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    :host([data-tone='ready']) {
      color: var(--gw-text);
    }
    .chip-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--gw-growth);
      box-shadow: 0 0 0 3px var(--gw-growth-halo);
    }
  `,
})
export class ChipComponent {
  readonly tone = input<ChipTone>('neutral');
}
