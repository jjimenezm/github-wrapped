import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChipComponent, ChipTone } from './chip.component';

@Component({
  imports: [ChipComponent],
  template: `<gw-chip [tone]="tone()">ene–nov 2026</gw-chip>`,
})
class HostComponent {
  readonly tone = input<ChipTone>('neutral');
}

describe('ChipComponent', () => {
  function render(tone?: ChipTone) {
    const fixture = TestBed.createComponent(HostComponent);
    if (tone) fixture.componentRef.setInput('tone', tone);
    fixture.detectChanges();
    const chip = (fixture.nativeElement as HTMLElement).querySelector('gw-chip');
    if (!chip) throw new Error('No chip');
    return chip as HTMLElement;
  }

  it('shows its text without a status dot by default', () => {
    const chip = render();

    expect(chip.textContent?.trim()).toBe('ene–nov 2026');
    expect(chip.querySelector('.chip-dot')).toBeNull();
  });

  it('adds a decorative dot when it marks something as ready', () => {
    const chip = render('ready');

    expect(chip.getAttribute('data-tone')).toBe('ready');
    expect(chip.querySelector('.chip-dot')?.getAttribute('aria-hidden')).toBe('true');
    expect(chip.textContent?.trim()).toBe('ene–nov 2026');
  });
});
