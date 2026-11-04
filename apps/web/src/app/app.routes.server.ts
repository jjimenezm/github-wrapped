import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Only the public page `/@login/year` renders on the server: link previews need its HTML, and it
 * answers 404 or 410 when there is no wrap. Everything else, its slides included, renders on the
 * client.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: ':handle/:year',
    renderMode: RenderMode.Server,
  },
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
