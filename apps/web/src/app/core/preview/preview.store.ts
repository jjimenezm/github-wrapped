import { Injectable, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { WrapSnapshot } from '@wrapped/shared';

/**
 * The snapshot the entry looked up, kept in memory for the slides and the card chooser. It is
 * never persisted: nothing is stored for people who don't publish (R18).
 */
@Injectable({ providedIn: 'root' })
export class PreviewStore {
  private readonly current = signal<WrapSnapshot | null>(null);

  readonly snapshot = this.current.asReadonly();

  set(snapshot: WrapSnapshot): void {
    this.current.set(snapshot);
  }
}

/** The slides need a snapshot; without one (a reload, a copied URL) the visitor starts over. */
export const requirePreview: CanActivateFn = () =>
  inject(PreviewStore).snapshot() ? true : inject(Router).createUrlTree(['/']);
