import { ApplicationInitStatus } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VIDEO_SHARING } from '../../core/config/features';
import { provideI18n } from '../../core/i18n/i18n.providers';
import { DeleteConfirmComponent } from './delete-confirm.component';

describe('DeleteConfirmComponent', () => {
  let fixture: ComponentFixture<DeleteConfirmComponent>;
  let el: HTMLElement;
  let confirmed: ReturnType<typeof vi.fn<() => void>>;
  let cancelled: ReturnType<typeof vi.fn<() => void>>;

  afterEach(() => vi.restoreAllMocks());

  async function render(inputs: { busy?: boolean; error?: string | null } = {}) {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CL']);
    TestBed.configureTestingModule({
      imports: [DeleteConfirmComponent],
      providers: [provideI18n()],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    fixture = TestBed.createComponent(DeleteConfirmComponent);
    fixture.componentRef.setInput('year', 2026);
    fixture.componentRef.setInput('busy', inputs.busy ?? false);
    fixture.componentRef.setInput('error', inputs.error ?? null);
    confirmed = vi.fn<() => void>();
    cancelled = vi.fn<() => void>();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.cancelled.subscribe(cancelled);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  }

  const button = (name: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);

  it('is a modal dialog that says which year goes and what is deleted', async () => {
    await render();

    const dialog = el.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    const title = el.querySelector(`#${dialog?.getAttribute('aria-labelledby')}`);
    expect(title?.textContent?.trim()).toBe('¿Eliminar tu wrap 2026?');
    // Phase 1 has no video, so the list doesn't promise to delete one.
    expect([...el.querySelectorAll('li')].map((li) => li.textContent?.trim())).toEqual([
      'Tus datos, la tarjeta y la imagen',
      'El link y el QR dejan de funcionar',
    ]);
  });

  it('lists the video too once videos exist', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: VIDEO_SHARING, useValue: true }] });
    await render();

    expect([...el.querySelectorAll('li')].map((li) => li.textContent?.trim())).toContain(
      'El video de 30 s',
    );
  });

  it('starts on "Cancelar", so a stray Enter deletes nothing', async () => {
    await render();

    expect(document.activeElement).toBe(button('Cancelar'));
  });

  it('confirms only with the destructive button', async () => {
    await render();

    button('Eliminar wrap')?.click();

    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalled();
  });

  it('cancels with the button, the scrim or Escape', async () => {
    await render();

    button('Cancelar')?.click();
    el.querySelector<HTMLElement>('.scrim')?.click();
    el.querySelector('[role="dialog"]')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(cancelled).toHaveBeenCalledTimes(3);
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('cannot be confirmed twice or dismissed while deleting', async () => {
    await render({ busy: true });

    expect(button('Eliminando…')?.disabled).toBe(true);
    expect(button('Cancelar')?.disabled).toBe(true);
    el.querySelector<HTMLElement>('.scrim')?.click();
    expect(cancelled).not.toHaveBeenCalled();
  });

  it('shows why the deletion failed', async () => {
    await render({ error: 'failed' });

    expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'No pudimos eliminarlo. Inténtalo otra vez.',
    );
  });
});
