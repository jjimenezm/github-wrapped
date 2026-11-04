import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ToastComponent, ToastTone } from './toast.component';

@Component({
  imports: [ToastComponent],
  template: `<gw-toast [visible]="visible()" [tone]="tone()">{{ text() }}</gw-toast>`,
})
class HostComponent {
  readonly visible = input(false);
  readonly tone = input<ToastTone>('neutral');
  readonly text = input('');
}

describe('ToastComponent', () => {
  function render(inputs: { visible?: boolean; tone?: ToastTone; text?: string } = {}) {
    const fixture = TestBed.createComponent(HostComponent);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    const toast = (fixture.nativeElement as HTMLElement).querySelector('gw-toast');
    if (!toast) throw new Error('No toast');
    return toast as HTMLElement;
  }

  it('is a status region even while hidden, so screen readers hear what appears in it', () => {
    const toast = render();

    expect(toast.getAttribute('role')).toBe('status');
    expect(toast.hasAttribute('data-visible')).toBe(false);
  });

  it('shows its message, with a check only for a success', () => {
    const neutral = render({ visible: true, text: 'Mantén presionado el enlace' });
    expect(neutral.hasAttribute('data-visible')).toBe(true);
    expect(neutral.textContent?.trim()).toBe('Mantén presionado el enlace');
    expect(neutral.querySelector('gw-icon')).toBeNull();

    const success = render({ visible: true, tone: 'success', text: 'Enlace copiado' });
    expect(success.querySelector('gw-icon')).not.toBeNull();
  });
});
