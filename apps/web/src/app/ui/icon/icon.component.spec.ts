import { TestBed } from '@angular/core/testing';
import upstream from '@primer/octicons/build/data.json';
import { IconComponent } from './icon.component';
import { OCTICONS, OcticonName } from './octicons';

function upstreamPaths(name: string): string[] {
  const icon = (upstream as Record<string, { heights: Record<string, { path: string }> }>)[name];
  const markup = icon?.heights['16']?.path ?? '';
  return [...markup.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
}

describe('OCTICONS', () => {
  it.each(Object.keys(OCTICONS))('%s matches the 16px Octicon from @primer/octicons', (name) => {
    expect(OCTICONS[name as OcticonName]).toEqual(upstreamPaths(name));
  });
});

describe('IconComponent', () => {
  function render(name: OcticonName, label?: string) {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', name);
    if (label) fixture.componentRef.setInput('label', label);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws the Octicon paths in a 16px viewBox', () => {
    const svg = render('arrow-up-right').querySelector('svg');

    expect(svg?.getAttribute('viewBox')).toBe('0 0 16 16');
    expect([...(svg?.querySelectorAll('path') ?? [])].map((p) => p.getAttribute('d'))).toEqual(
      OCTICONS['arrow-up-right'],
    );
  });

  it('is decorative by default', () => {
    const svg = render('x').querySelector('svg');

    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
  });

  it('becomes an image with a name when it carries meaning on its own', () => {
    const svg = render('alert', 'Error').querySelector('svg');

    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Error');
    expect(svg?.getAttribute('aria-hidden')).toBeNull();
  });
});
