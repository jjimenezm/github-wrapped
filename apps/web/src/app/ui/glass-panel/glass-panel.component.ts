import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type GlassPadding = 'none' | 'sm' | 'md' | 'lg';

/** Frosted surface over the ink: translucent fill, hairline border and a lit top edge. */
@Component({
  selector: 'gw-glass-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-padding]': 'padding()' },
  template: `<ng-content />`,
  styles: `
    :host {
      display: block;
      border: 1px solid var(--gw-hair);
      border-radius: var(--gw-radius-md);
      background: var(--gw-glass);
      box-shadow: inset 0 1px 0 var(--gw-edge-light);
      -webkit-backdrop-filter: var(--gw-blur);
      backdrop-filter: var(--gw-blur);
    }
    :host([data-padding='sm']) {
      padding: var(--gw-space-2) var(--gw-space-3);
    }
    :host([data-padding='md']) {
      padding: var(--gw-space-3) var(--gw-space-4);
    }
    :host([data-padding='lg']) {
      padding: var(--gw-space-5);
    }
  `,
})
export class GlassPanelComponent {
  readonly padding = input<GlassPadding>('md');
}
