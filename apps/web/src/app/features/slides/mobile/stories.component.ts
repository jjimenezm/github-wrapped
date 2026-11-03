import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { periodChip, type WrapSnapshot } from '@wrapped/shared';
import { LocaleService } from '../../../core/i18n/locale.service';
import { ChipComponent } from '../../../ui/chip/chip.component';
import { IconButtonComponent } from '../../../ui/icon-button/icon-button.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { ProjectsSlideComponent } from './projects-slide.component';
import { SummarySlideComponent } from './summary-slide.component';

type Slide = 'summary' | 'projects';

/** The outer thirds of the slide are tap zones; the middle is for reading. */
const EDGE = 0.3;
/** A horizontal drag this long (and mostly sideways) is a swipe, not a tap. */
const SWIPE_PX = 48;

/**
 * The Stories container: one segment per slide, no auto-advance. Taps on the left or right edge
 * and swipes move between slides, links and buttons keep their taps, and visible buttons plus
 * the arrow keys do the same for a mouse or keyboard. Past the last slide comes choosing a card.
 */
@Component({
  selector: 'gw-stories',
  imports: [
    TranslocoPipe,
    ChipComponent,
    IconComponent,
    IconButtonComponent,
    ProjectsSlideComponent,
    SummarySlideComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  templateUrl: './stories.component.html',
  styleUrl: './stories.component.css',
})
export class StoriesComponent {
  readonly snapshot = input.required<WrapSnapshot>();
  readonly finished = output();

  private readonly locale = inject(LocaleService).locale;
  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport');
  private dragStart: { x: number; y: number } | null = null;
  private swiped = false;

  protected readonly slides = computed((): Slide[] =>
    this.snapshot().featured.length ? ['summary', 'projects'] : ['summary'],
  );
  protected readonly index = signal(0);
  protected readonly current = computed(() => this.slides()[this.index()] ?? 'summary');
  protected readonly isLast = computed(() => this.index() >= this.slides().length - 1);
  /** Which way the last move went, so the next slide enters from that side. */
  protected readonly direction = signal<'forward' | 'back'>('forward');
  protected readonly chip = computed(() => periodChip(this.snapshot().period, this.locale()));

  protected next(): void {
    if (this.isLast()) {
      this.finished.emit();
      return;
    }
    this.direction.set('forward');
    this.index.update((i) => i + 1);
  }

  protected previous(): void {
    if (this.index() === 0) return;
    this.direction.set('back');
    this.index.update((i) => i - 1);
  }

  protected onPointerDown(event: PointerEvent): void {
    this.dragStart = { x: event.clientX, y: event.clientY };
  }

  protected onPointerUp(event: PointerEvent): void {
    const start = this.dragStart;
    this.dragStart = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    this.swiped = true;
    if (dx < 0) this.next();
    else this.previous();
  }

  protected onTap(event: MouseEvent): void {
    if (this.swiped) {
      // The click that ends a swipe isn't a tap, not even on a link.
      this.swiped = false;
      event.preventDefault();
      return;
    }
    if ((event.target as Element | null)?.closest('a, button')) return;
    const box = this.viewport().nativeElement.getBoundingClientRect();
    if (box.width <= 0) return;
    const x = (event.clientX - box.left) / box.width;
    if (x >= 1 - EDGE) this.next();
    else if (x <= EDGE) this.previous();
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight') this.next();
    else if (event.key === 'ArrowLeft') this.previous();
  }
}
