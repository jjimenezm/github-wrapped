import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { renderCard } from '@wrapped/art';
import { CARD_STYLES, type CardStyle, type Locale, type WrapSnapshot } from '@wrapped/shared';
import { PUBLIC_BASE_URL } from '../../../core/config/public-base-url';

/** A horizontal drag this long is a swipe; shorter ones are taps or wobbles. */
const SWIPE_PX = 48;

/**
 * The three cards side by side, the chosen one in the center. Swipes, taps on a side card, the
 * dots and the arrow keys all move it. The cards are drawn here by packages/art; before
 * publishing their QR is a marker, so no screenshot shares a link to a page that isn't there.
 */
@Component({
  selector: 'gw-card-carousel',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  templateUrl: './card-carousel.component.html',
  styleUrl: './card-carousel.component.css',
})
export class CardCarouselComponent {
  readonly snapshot = input.required<WrapSnapshot>();
  /** The card's language: the UI's before publishing, the wrap's own once published. */
  readonly locale = input.required<Locale>();
  readonly qr = input<'placeholder' | 'code'>('placeholder');
  readonly selected = model<CardStyle>('huella');

  private readonly sanitizer = inject(DomSanitizer);
  private readonly baseUrl = inject(PUBLIC_BASE_URL);
  private dragStart: number | null = null;
  private swiped = false;

  protected readonly styles = CARD_STYLES;
  protected readonly drag = signal(0);
  protected readonly dragging = signal(false);
  protected readonly index = computed(() => Math.max(0, CARD_STYLES.indexOf(this.selected())));

  // Our own markup from packages/art, which escapes every text it prints; the sanitizer would
  // strip the SVG. Inline (not an <img>) so the cards use the page's Geist fonts.
  protected readonly cards = computed(() =>
    CARD_STYLES.map((style) => ({
      style,
      svg: this.sanitizer.bypassSecurityTrustHtml(
        renderCard(this.snapshot(), {
          style,
          locale: this.locale(),
          format: 'portrait',
          publicBaseUrl: this.baseUrl,
          qr: this.qr(),
          animated: true,
        }),
      ),
    })),
  );

  protected select(index: number): void {
    const style = CARD_STYLES[Math.min(CARD_STYLES.length - 1, Math.max(0, index))];
    if (style) this.selected.set(style);
  }

  protected onPointerDown(event: PointerEvent): void {
    this.dragStart = event.clientX;
    this.dragging.set(true);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragStart === null) return;
    this.drag.set(event.clientX - this.dragStart);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.dragStart === null) return;
    const dx = event.clientX - this.dragStart;
    this.endDrag();
    if (Math.abs(dx) < SWIPE_PX) return;
    this.swiped = true;
    this.select(this.index() + (dx < 0 ? 1 : -1));
  }

  protected endDrag(): void {
    this.dragStart = null;
    this.dragging.set(false);
    this.drag.set(0);
  }

  protected onTap(event: MouseEvent): void {
    if (this.swiped) {
      this.swiped = false;
      return;
    }
    const slide = (event.target as Element | null)?.closest<HTMLElement>('[data-index]');
    if (slide) this.select(Number(slide.dataset['index']));
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight') this.select(this.index() + 1);
    else if (event.key === 'ArrowLeft') this.select(this.index() - 1);
  }
}
