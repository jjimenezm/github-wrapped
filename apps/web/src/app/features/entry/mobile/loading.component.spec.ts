import { ApplicationInitStatus } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../../core/i18n/i18n.providers';
import { LoadingComponent, MESSAGE_INTERVAL_MS } from './loading.component';

const MESSAGES = [
  'Buscando tu actividad pública…',
  'Leyendo contribuciones y repositorios…',
  'Detectando lenguajes y proyectos destacados…',
  'Preparando tu wrap…',
];
const SLOW = 'GitHub está tardando más de lo normal. Seguimos esperando…';

describe('LoadingComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  async function render(): Promise<ComponentFixture<LoadingComponent>> {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CL']);
    TestBed.configureTestingModule({ imports: [LoadingComponent], providers: [provideI18n()] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(LoadingComponent);
    fixture.componentRef.setInput('login', 'ana-dev');
    fixture.detectChanges();
    return fixture;
  }

  const el = (fixture: ComponentFixture<LoadingComponent>) => fixture.nativeElement as HTMLElement;
  const message = (fixture: ComponentFixture<LoadingComponent>) =>
    el(fixture).querySelector('[aria-live="polite"]')?.textContent?.trim();

  function wait(fixture: ComponentFixture<LoadingComponent>, ms: number): void {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  }

  it('shows who is being looked up and the first message, announced politely', async () => {
    const fixture = await render();

    expect(el(fixture).textContent).toContain('@ana-dev');
    expect(message(fixture)).toBe(MESSAGES[0]);
    expect(el(fixture).querySelectorAll('gw-grid-loader .gl-cell')).toHaveLength(9);
  });

  it('replaces the message every 2.5 s', async () => {
    const fixture = await render();
    const seen = [message(fixture)];

    for (let i = 1; i < MESSAGES.length; i++) {
      wait(fixture, MESSAGE_INTERVAL_MS - 1);
      expect(message(fixture)).toBe(seen[i - 1]);
      wait(fixture, 1);
      seen.push(message(fixture));
    }

    expect(MESSAGE_INTERVAL_MS).toBe(2500);
    expect(seen).toEqual(MESSAGES);
  });

  it('keeps rotating when GitHub is slow, without starting over', async () => {
    const fixture = await render();

    wait(fixture, MESSAGE_INTERVAL_MS * MESSAGES.length);
    expect(message(fixture)).toBe(SLOW);
    wait(fixture, MESSAGE_INTERVAL_MS);
    expect(message(fixture)).toBe(MESSAGES[3]);
    wait(fixture, MESSAGE_INTERVAL_MS);
    expect(message(fixture)).toBe(SLOW);
  });

  it('never shows a percentage or a progress bar', async () => {
    const fixture = await render();

    for (let t = 0; t <= 20_000; t += MESSAGE_INTERVAL_MS) {
      expect(el(fixture).textContent).not.toMatch(/\d\s*%/);
      wait(fixture, MESSAGE_INTERVAL_MS);
    }
    expect(el(fixture).querySelector('progress, [role="progressbar"]')).toBeNull();
  });

  it('offers a way out', async () => {
    const fixture = await render();
    const cancel = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancel);

    const button = [...el(fixture).querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Cancelar',
    );
    button?.click();

    expect(cancel).toHaveBeenCalledOnce();
  });

  it('stops its timer when it goes away', async () => {
    const fixture = await render();
    const running = vi.getTimerCount();

    fixture.destroy();

    expect(vi.getTimerCount()).toBe(running - 1);
  });
});
