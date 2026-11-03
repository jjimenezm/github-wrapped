import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GlassPanelComponent } from './glass-panel.component';

@Component({
  imports: [GlassPanelComponent],
  template: `
    <gw-glass-panel><p>default</p></gw-glass-panel>
    <gw-glass-panel padding="lg"><p>roomy</p></gw-glass-panel>
  `,
})
class HostComponent {}

describe('GlassPanelComponent', () => {
  it('wraps projected content and exposes its padding step for styling', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const [base, roomy] = (fixture.nativeElement as HTMLElement).querySelectorAll('gw-glass-panel');

    expect(base.textContent?.trim()).toBe('default');
    expect(base.getAttribute('data-padding')).toBe('md');
    expect(roomy.getAttribute('data-padding')).toBe('lg');
  });
});
