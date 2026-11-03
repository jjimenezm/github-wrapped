import { isDevMode } from '@angular/core';
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    // Internal sample of the visual primitives; development builds only.
    path: '_ui',
    canMatch: [() => isDevMode()],
    loadComponent: () =>
      import('./features/ui-sample/ui-sample.component').then((m) => m.UiSampleComponent),
  },
];
