import { isPlatformBrowser } from '@angular/common';
import {
  DOCUMENT,
  DestroyRef,
  Injectable,
  PLATFORM_ID,
  Signal,
  inject,
  signal,
} from '@angular/core';

/** Keep in sync with the phone frame's media query (its spec checks it). */
export const DESKTOP_QUERY = '(min-width: 768px)';

/**
 * Whether the viewport is desktop-sized. Until the desktop tree exists, nothing renders
 * differently from it: the phone frame is pure CSS so server and client HTML match.
 */
@Injectable({ providedIn: 'root' })
export class BreakpointService {
  private readonly desktop = signal(false);
  readonly isDesktop: Signal<boolean> = this.desktop.asReadonly();

  constructor() {
    const view = inject(DOCUMENT).defaultView;
    if (!isPlatformBrowser(inject(PLATFORM_ID)) || typeof view?.matchMedia !== 'function') return;

    const query = view.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => this.desktop.set(event.matches);
    this.desktop.set(query.matches);
    query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
  }
}
