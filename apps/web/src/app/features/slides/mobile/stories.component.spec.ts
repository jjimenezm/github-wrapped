import { ApplicationInitStatus } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { WrapSnapshot } from '@wrapped/shared';
import { installMatchMedia, type FakeMatchMedia } from '../../../../testing/match-media';
import { demoRepo, demoSnapshot } from '../../../../testing/snapshot';
import { provideI18n } from '../../../core/i18n/i18n.providers';
import { StoriesComponent } from './stories.component';

const WITH_PROJECTS = demoSnapshot({
  featured: [demoRepo('sismos-chile-api'), demoRepo('wrapped')],
});

describe('StoriesComponent', () => {
  let media: FakeMatchMedia;
  let fixture: ComponentFixture<StoriesComponent>;
  let finished: ReturnType<typeof vi.fn<() => void>>;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    media.restore();
    localStorage.clear();
  });

  async function render(snapshot: WrapSnapshot = WITH_PROJECTS) {
    media = installMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CL']);
    TestBed.configureTestingModule({ imports: [StoriesComponent], providers: [provideI18n()] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    fixture = TestBed.createComponent(StoriesComponent);
    fixture.componentRef.setInput('snapshot', snapshot);
    finished = vi.fn<() => void>();
    fixture.componentInstance.finished.subscribe(finished);
    await fixture.whenStable();
    vi.spyOn(viewport(), 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 390, height: 700 }),
    );
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const viewport = () => el().querySelector<HTMLElement>('.viewport') as HTMLElement;
  const text = (node: Element | null | undefined) =>
    node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const slide = () =>
    el().querySelector('gw-projects-slide')
      ? 'projects'
      : el().querySelector('gw-summary-slide')
        ? 'summary'
        : null;
  const segments = () => [...el().querySelectorAll('.segments li')];
  const button = (name: string) =>
    [...el().querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === name || text(b) === name,
    );

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function tap(x: number, target: Element = viewport()): Promise<void> {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: 300 }));
    await settle();
  }

  async function swipe(fromX: number, toX: number): Promise<void> {
    const at = (type: string, clientX: number) =>
      viewport().dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, clientY: 300 }));
    at('pointerdown', fromX);
    at('pointerup', toX);
    at('click', toX);
    await settle();
  }

  describe('segments and header', () => {
    it('has one segment per slide, marking the current one', async () => {
      await render();

      expect(segments()).toHaveLength(2);
      expect(segments()[0]?.getAttribute('aria-current')).toBe('step');
      expect(segments()[1]?.hasAttribute('aria-current')).toBe(false);
    });

    it('drops the projects slide when there are no featured repos', async () => {
      await render(demoSnapshot({ featured: [] }));

      expect(segments()).toHaveLength(1);
      expect(text(button('Elegir mi tarjeta'))).toBe('Elegir mi tarjeta');
    });

    it('names the person and the period on top', async () => {
      await render();
      const who = el().querySelector('.who');

      expect(who?.querySelector('img')?.getAttribute('src')).toBe(WITH_PROJECTS.avatarUrl);
      expect(text(who)).toContain('@ana-dev');
      expect(text(who?.querySelector('gw-chip'))).toBe('ene–nov 2026');
    });

    it('shows the whole year in the chip once it is over', async () => {
      await render(
        demoSnapshot({
          period: { year: 2026, from: '2026-01-01', to: '2026-12-31', complete: true },
        }),
      );

      expect(text(el().querySelector('.who gw-chip'))).toBe('ene–dic 2026');
    });
  });

  it('names the last step after where it leads when the page sets one', async () => {
    await render(demoSnapshot());
    fixture.componentRef.setInput('finishLabel', 'slides.backToCard');
    await settle();

    button('Volver a la tarjeta')?.click();

    expect(finished).toHaveBeenCalledTimes(1);
  });

  describe('moving between slides', () => {
    it('goes forward with a tap on the right edge and back with one on the left', async () => {
      await render();

      await tap(370);
      expect(slide()).toBe('projects');
      expect(segments()[1]?.getAttribute('aria-current')).toBe('step');

      await tap(20);
      expect(slide()).toBe('summary');
    });

    it('moves on to choosing a card from the right edge of the last slide', async () => {
      await render();
      await tap(370);

      await tap(370);

      expect(finished).toHaveBeenCalledOnce();
    });

    it('lets links take the tap, even on the right edge', async () => {
      await render();
      const blockNavigation = (event: Event) => event.preventDefault();
      document.addEventListener('click', blockNavigation);
      const source = el().querySelector('.metric a');

      await tap(370, source as Element);
      document.removeEventListener('click', blockNavigation);

      expect(slide()).toBe('summary');
    });

    it('lets the Repo button take the tap on the projects slide', async () => {
      await render();
      await tap(370);
      const blockNavigation = (event: Event) => event.preventDefault();
      document.addEventListener('click', blockNavigation);
      const repo = [...el().querySelectorAll('.project a')].find((a) => text(a) === 'Repo');

      await tap(370, repo as Element);
      document.removeEventListener('click', blockNavigation);

      expect(slide()).toBe('projects');
      expect(finished).not.toHaveBeenCalled();
    });

    it('follows a swipe, without counting the swipe as a tap', async () => {
      await render();

      await swipe(300, 120);
      expect(slide()).toBe('projects');

      await swipe(100, 300);
      expect(slide()).toBe('summary');
    });

    it('never moves on by itself', async () => {
      await render();
      vi.useFakeTimers();

      vi.advanceTimersByTime(30_000);
      fixture.detectChanges();

      expect(slide()).toBe('summary');
      expect(finished).not.toHaveBeenCalled();
    });

    it('moves with the arrow keys', async () => {
      await render();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await settle();
      expect(slide()).toBe('projects');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await settle();
      expect(slide()).toBe('summary');
    });

    it('has visible, named previous and next buttons', async () => {
      await render();
      const previous = button('Anterior');

      expect(previous?.disabled).toBe(true);
      button('Siguiente')?.click();
      await settle();

      expect(slide()).toBe('projects');
      expect(button('Anterior')?.disabled).toBe(false);
      expect(button('Elegir mi tarjeta')).toBeDefined();
    });
  });
});
