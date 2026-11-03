import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CARD_STYLES, type CardStyle, type WrapSnapshot } from '@wrapped/shared';

export const PREVIEW_STORAGE_KEY = 'gw.preview';

interface Saved {
  snapshot: WrapSnapshot;
  style: CardStyle;
}

const isCardStyle = (value: unknown): value is CardStyle =>
  (CARD_STYLES as readonly unknown[]).includes(value);

/**
 * The snapshot the entry looked up and the card the person picks, for the slides and the card
 * chooser. Publishing is a full round trip to GitHub, so both are kept in this tab's
 * sessionStorage (gone when the tab closes). Nothing reaches the server until the person
 * publishes (R18), and a blocked storage only costs the round trip.
 */
@Injectable({ providedIn: 'root' })
export class PreviewStore {
  private readonly storage = isPlatformBrowser(inject(PLATFORM_ID))
    ? inject(DOCUMENT).defaultView
    : null;
  private readonly current = signal<WrapSnapshot | null>(null);
  private readonly card = signal<CardStyle>('huella');

  readonly snapshot = this.current.asReadonly();
  readonly style = this.card.asReadonly();

  constructor() {
    const saved = this.read();
    if (saved) {
      this.current.set(saved.snapshot);
      this.card.set(saved.style);
    }
  }

  set(snapshot: WrapSnapshot): void {
    this.current.set(snapshot);
    this.write();
  }

  setStyle(style: CardStyle): void {
    this.card.set(style);
    this.write();
  }

  private read(): Saved | null {
    try {
      const raw = this.storage?.sessionStorage.getItem(PREVIEW_STORAGE_KEY);
      const saved = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
      if (!saved?.snapshot?.login || !isCardStyle(saved.style)) return null;
      return { snapshot: saved.snapshot, style: saved.style };
    } catch {
      return null;
    }
  }

  private write(): void {
    const snapshot = this.current();
    if (!snapshot) return;
    try {
      this.storage?.sessionStorage.setItem(
        PREVIEW_STORAGE_KEY,
        JSON.stringify({ snapshot, style: this.card() } satisfies Saved),
      );
    } catch {
      // Storage blocked or full: the in-memory copy still serves this page.
    }
  }
}

/** The slides need a snapshot; without one (a new tab, a copied URL) the visitor starts over. */
export const requirePreview: CanActivateFn = () =>
  inject(PreviewStore).snapshot() ? true : inject(Router).createUrlTree(['/']);
