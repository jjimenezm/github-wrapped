import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { authUrl } from '../../core/api/auth-url';
import { IconComponent } from '../../ui/icon/icon.component';

/**
 * "¿Es tuyo? Gestionar", in the page's footer, away from what visitors do. A plain link to the
 * GitHub sign-in with the `manage` intent: the owner lands on the share screen, anyone else
 * back on this page with a notice. `nofollow`, so crawlers don't start sign-ins.
 */
@Component({
  selector: 'gw-manage-link',
  imports: [TranslocoPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [href]="href()" rel="nofollow">
      <gw-icon name="person" />
      {{ 'public.manage' | transloco }}
    </a>
  `,
  styles: `
    a {
      display: inline-flex;
      gap: 7px;
      align-items: center;
      min-height: var(--gw-hit);
      padding: 0 var(--gw-space-2);
      color: var(--gw-text);
      font: 500 var(--gw-text-sm) / 1 var(--gw-font-sans);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
      text-underline-offset: 4px;
    }
  `,
})
export class ManageLinkComponent {
  readonly login = input.required<string>();
  readonly year = input.required<number>();

  protected readonly href = computed(() =>
    authUrl({ intent: 'manage', login: this.login(), year: this.year() }),
  );
}
