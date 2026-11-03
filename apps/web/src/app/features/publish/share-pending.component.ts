import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { wrapPath } from '../../core/routing/wrap-url';
import { WordmarkComponent } from '../../ui/wordmark/wordmark.component';

/** Stand-in for the share screen (`/@login/year/share`) until it lands, with "Cambiar tarjeta". */
@Component({
  selector: 'gw-share-pending',
  imports: [RouterLink, TranslocoPipe, WordmarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bar"><gw-wordmark /></header>
    <main class="body">
      <p class="login gw-mono">&#64;{{ login }} · {{ year }}</p>
      <h1>{{ 'publish.share.title' | transloco }}</h1>
      <p class="note">{{ 'publish.share.body' | transloco }}</p>
      <a class="gw-button gw-button--secondary" [routerLink]="cardPath">{{
        'publish.share.change' | transloco
      }}</a>
      <a class="gw-button gw-button--quiet" routerLink="/">{{
        'publish.share.home' | transloco
      }}</a>
    </main>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: var(--gw-screen-h);
    }
    .bar {
      display: flex;
      align-items: center;
      height: 64px;
      padding: var(--gw-space-2) var(--gw-space-5) 0;
    }
    .body {
      display: flex;
      flex: 1;
      flex-direction: column;
      justify-content: center;
      gap: var(--gw-space-3);
      padding: 0 var(--gw-space-6) var(--gw-space-12);
    }
    .login,
    .note {
      margin: 0;
      color: var(--gw-text-muted);
      font-size: var(--gw-text-sm);
    }
    h1 {
      margin: 0;
      font: 600 var(--gw-text-3xl) / 1.12 var(--gw-font-sans);
      letter-spacing: var(--gw-tracking-tight);
    }
    .note {
      margin-bottom: var(--gw-space-5);
    }
  `,
})
export class SharePendingComponent {
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;

  protected readonly login = this.params.get('login') ?? '';
  protected readonly year = Number(this.params.get('year'));
  protected readonly cardPath = wrapPath(this.login, this.year, 'card');
}
