import { isDevMode } from '@angular/core';
import { Routes } from '@angular/router';
import { requirePreview } from './core/preview/preview.store';
import { hasOAuthError } from './core/routing/oauth-error';
import { wrapMatcher, wrapPageMatch } from './core/routing/wrap-url';
import { EntryComponent } from './features/entry/mobile/entry.component';

export const routes: Routes = [
  {
    // Back from GitHub without a publication: same URL as the entry, its own screen.
    path: '',
    pathMatch: 'full',
    canMatch: [hasOAuthError],
    loadComponent: () =>
      import('./features/publish/oauth-return.component').then((m) => m.OAuthReturnComponent),
  },
  // The landing screen ships in the main bundle: it is what every visitor sees first.
  { path: '', pathMatch: 'full', component: EntryComponent },
  {
    path: 'slides',
    canActivate: [requirePreview],
    loadComponent: () =>
      import('./features/slides/slides-page.component').then((m) => m.SlidesPageComponent),
  },
  {
    path: 'publish',
    canActivate: [requirePreview],
    loadComponent: () =>
      import('./features/publish/mobile/choose-card.component').then((m) => m.ChooseCardComponent),
  },
  {
    matcher: wrapMatcher('share'),
    loadComponent: () =>
      import('./features/share/mobile/share.component').then((m) => m.ShareComponent),
  },
  {
    matcher: wrapMatcher('card'),
    loadComponent: () =>
      import('./features/publish/mobile/change-card.component').then((m) => m.ChangeCardComponent),
  },
  {
    // The public page, rendered on the server (app.routes.server.ts), and its slides. After the
    // share and card screens, which also start with @login/year.
    path: ':handle/:year',
    canMatch: [wrapPageMatch],
    loadChildren: () =>
      import('./features/public-wrap/public-wrap.routes').then((m) => m.PUBLIC_WRAP_ROUTES),
  },
  {
    // Internal sample of the visual primitives; development builds only.
    path: '_ui',
    canMatch: [() => isDevMode()],
    loadComponent: () =>
      import('./features/ui-sample/ui-sample.component').then((m) => m.UiSampleComponent),
  },
  { path: '**', redirectTo: '' },
];
