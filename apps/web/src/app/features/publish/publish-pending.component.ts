import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PreviewStore } from '../../core/preview/preview.store';
import { WordmarkComponent } from '../../ui/wordmark/wordmark.component';

/** Stand-in for choosing a card until that screen lands, with a way back to the slides. */
@Component({
  selector: 'gw-publish-pending',
  imports: [RouterLink, TranslocoPipe, WordmarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bar"><gw-wordmark /></header>
    @if (snapshot(); as s) {
      <main class="body">
        <p class="login gw-mono">&#64;{{ s.login }}</p>
        <h1>{{ 'publish.pending.title' | transloco }}</h1>
        <p class="note">{{ 'publish.pending.body' | transloco }}</p>
        <a class="gw-button gw-button--secondary" routerLink="/slides">{{
          'publish.pending.back' | transloco
        }}</a>
      </main>
    }
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
    a {
      align-self: flex-start;
      margin-top: var(--gw-space-6);
    }
  `,
})
export class PublishPendingComponent {
  protected readonly snapshot = inject(PreviewStore).snapshot;
}
