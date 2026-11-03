import { DOCUMENT, Injectable, inject } from '@angular/core';

/**
 * Leaves the app for a full page load (the GitHub sign-in goes through the api, not the router).
 * A service so specs can see where the app would go without leaving the test page.
 */
@Injectable({ providedIn: 'root' })
export class ExternalNavigation {
  private readonly document = inject(DOCUMENT);

  go(url: string): void {
    this.document.defaultView?.location.assign(url);
  }
}
