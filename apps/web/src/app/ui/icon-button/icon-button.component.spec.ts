import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IconButtonComponent } from './icon-button.component';

@Component({
  imports: [IconButtonComponent],
  template: `<gw-icon-button
    icon="x"
    label="Cerrar"
    [disabled]="disabled()"
    (press)="presses = presses + 1"
  />`,
})
class HostComponent {
  readonly disabled = signal(false);
  presses = 0;
}

describe('IconButtonComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    if (!button) throw new Error('No native button');
    return { fixture, button };
  }

  it('is a native button named by its label, with a decorative icon', () => {
    const { button } = render();

    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Cerrar');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('emits press when activated', () => {
    const { fixture, button } = render();

    button.click();

    expect(fixture.componentInstance.presses).toBe(1);
  });

  it('does not emit press while disabled', async () => {
    const { fixture, button } = render();
    fixture.componentInstance.disabled.set(true);
    await fixture.whenStable();

    button.click();

    expect(button.disabled).toBe(true);
    expect(fixture.componentInstance.presses).toBe(0);
  });
});
