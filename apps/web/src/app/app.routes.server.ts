import { RenderMode, ServerRoute } from '@angular/ssr';

// SSR is reserved for the public wrap page (added in U12); everything else renders on the client.
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
