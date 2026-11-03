import { isDevMode } from '@angular/core';
import { Routes } from '@angular/router';
import { requirePreview } from './core/preview/preview.store';
import { EntryComponent } from './features/entry/mobile/entry.component';

export const routes: Routes = [
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
      import('./features/publish/publish-pending.component').then((m) => m.PublishPendingComponent),
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
