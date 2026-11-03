import { TestBed } from '@angular/core/testing';
import { GridLoaderComponent } from './grid-loader.component';

interface FoundRule {
  selector: string;
  css: string;
  media: string[];
}

/** Every style rule in the document, with the media queries that wrap it. */
function styleRules(): FoundRule[] {
  const found: FoundRule[] = [];
  const walk = (rules: CSSRuleList, media: string[]) => {
    for (const rule of [...rules]) {
      if (rule instanceof CSSMediaRule) walk(rule.cssRules, [...media, rule.media.mediaText]);
      else if (rule instanceof CSSStyleRule)
        found.push({ selector: rule.selectorText, css: rule.style.cssText, media });
    }
  };
  for (const sheet of [...document.styleSheets]) walk(sheet.cssRules, []);
  return found;
}

const ANIMATES = /animation(-name)?\s*:\s*(?!none)/;

describe('GridLoaderComponent', () => {
  function render(label?: string) {
    const fixture = TestBed.createComponent(GridLoaderComponent);
    if (label !== undefined) fixture.componentRef.setInput('label', label);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws a 3×3 grid of nine cells', () => {
    const el = render();

    expect(el.querySelectorAll('.gl-cell')).toHaveLength(9);
  });

  it('only animates the cells when the user has no reduced-motion preference', () => {
    render();

    const cellAnimations = styleRules().filter(
      (r) => r.selector.includes('.gl-cell') && ANIMATES.test(r.css),
    );
    expect(cellAnimations.length).toBeGreaterThan(0);
    for (const rule of cellAnimations) {
      expect(rule.media.join(' ')).toContain('prefers-reduced-motion: no-preference');
    }
  });

  it('is hidden from assistive tech when it has no label', () => {
    const el = render();

    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.getAttribute('role')).toBeNull();
  });

  it('announces itself as a status with its label', () => {
    const el = render('Cargando tu año');

    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-hidden')).toBeNull();
    expect(el.textContent?.trim()).toBe('Cargando tu año');
  });
});
