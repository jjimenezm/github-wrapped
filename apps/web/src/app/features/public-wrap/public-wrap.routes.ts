import type { Routes } from '@angular/router';
import { PublicWrapShellComponent } from './public-wrap-shell.component';
import { PublicWrapComponent } from './public-wrap.component';
import { publicWrapResolver } from './public-wrap.resolver';

/**
 * Under `/@login/year`: the page (rendered on the server) and its slides (in the browser). The
 * shell holds the wrap for both and keeps the wrap's language until the visitor leaves.
 */
export const PUBLIC_WRAP_ROUTES: Routes = [
  {
    path: '',
    component: PublicWrapShellComponent,
    resolve: { page: publicWrapResolver },
    children: [
      { path: '', component: PublicWrapComponent },
      {
        path: 'slides',
        loadComponent: () => import('./wrap-slides.component').then((m) => m.WrapSlidesComponent),
      },
    ],
  },
];
