import { ApplicationInitStatus } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CardStyle } from '@wrapped/shared';
import { installMatchMedia, type FakeMatchMedia } from '../../../../testing/match-media';
import { demoSnapshot } from '../../../../testing/snapshot';
import { provideI18n } from '../../../core/i18n/i18n.providers';
import { CardCarouselComponent } from './card-carousel.component';

/** A path only the QR placeholder draws (the "no code yet" glyph). */
const PLACEHOLDER = 'M14 14h3v3h-3z';

describe('CardCarouselComponent', () => {
  let media: FakeMatchMedia;
  let fixture: ComponentFixture<CardCarouselComponent>;

  afterEach(() => {
    vi.restoreAllMocks();
    media.restore();
    localStorage.clear();
  });

  async function render(style: CardStyle = 'huella', qr: 'placeholder' | 'code' = 'placeholder') {
    media = installMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CL']);
    TestBed.configureTestingModule({
      imports: [CardCarouselComponent],
      providers: [provideI18n()],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    fixture = TestBed.createComponent(CardCarouselComponent);
    fixture.componentRef.setInput('snapshot', demoSnapshot());
    fixture.componentRef.setInput('locale', 'es');
    fixture.componentRef.setInput('selected', style);
    fixture.componentRef.setInput('qr', qr);
    await fixture.whenStable();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const label = () => el().querySelector('.cc-label')?.textContent?.trim();
  const slides = () => [...el().querySelectorAll<HTMLElement>('.cc-slide')];
  const active = () => slides().findIndex((s) => s.classList.contains('cc-slide--active'));
  const dots = () => [...el().querySelectorAll<HTMLButtonElement>('.cc-dots button')];

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function swipe(fromX: number, toX: number): Promise<void> {
    const surface = el().querySelector('.cc') as HTMLElement;
    const at = (type: string, clientX: number) =>
      surface.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, clientY: 200 }));
    at('pointerdown', fromX);
    at('pointermove', (fromX + toX) / 2);
    at('pointerup', toX);
    at('click', toX);
    await settle();
  }

  it('draws the three cards, each with the QR marker instead of a code', async () => {
    await render();

    expect(slides()).toHaveLength(3);
    for (const slide of slides()) {
      expect(slide.querySelector('svg')).not.toBeNull();
      expect(slide.innerHTML).toContain(PLACEHOLDER);
    }
  });

  it('draws the real QR once the wrap is published', async () => {
    await render('huella', 'code');

    expect(slides()[0]?.innerHTML).not.toContain(PLACEHOLDER);
  });

  it('starts on the given card, with its dot and its name', async () => {
    await render('cordillera');

    expect(active()).toBe(1);
    expect(label()).toBe('Cordillera');
    expect(dots()[1]?.getAttribute('aria-current')).toBe('true');
    expect(dots()[0]?.hasAttribute('aria-current')).toBe(false);
  });

  it('moves the center card, the dots and the name with a swipe', async () => {
    await render();

    await swipe(300, 100);

    expect(active()).toBe(1);
    expect(label()).toBe('Cordillera');
    expect(dots()[1]?.getAttribute('aria-current')).toBe('true');
    expect(fixture.componentInstance.selected()).toBe('cordillera');

    await swipe(300, 100);
    expect(label()).toBe('Constelación');

    await swipe(300, 100);
    expect(label()).toBe('Constelación');

    await swipe(100, 300);
    expect(label()).toBe('Cordillera');
  });

  it('ignores a short drag', async () => {
    await render();

    await swipe(200, 180);

    expect(label()).toBe('Huella');
  });

  it('picks a card from its dot or by tapping it', async () => {
    await render();

    dots()[2]?.click();
    await settle();
    expect(label()).toBe('Constelación');

    slides()[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(label()).toBe('Cordillera');
  });

  it('moves with the arrow keys', async () => {
    await render();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await settle();
    expect(label()).toBe('Cordillera');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await settle();
    expect(label()).toBe('Huella');
  });

  it('names every dot after its card', async () => {
    await render();

    expect(dots().map((d) => d.getAttribute('aria-label'))).toEqual([
      'Huella',
      'Cordillera',
      'Constelación',
    ]);
  });
});
