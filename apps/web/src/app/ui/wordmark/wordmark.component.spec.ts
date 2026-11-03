import { TestBed } from '@angular/core/testing';
import { WordmarkComponent } from './wordmark.component';

describe('WordmarkComponent', () => {
  it('reads as "wrapped", with its 3×3 mark hidden from screen readers', () => {
    const fixture = TestBed.createComponent(WordmarkComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const mark = el.querySelector('.wm-mark');

    expect(el.textContent?.trim()).toBe('wrapped');
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
    expect(mark?.children).toHaveLength(9);
  });
});
