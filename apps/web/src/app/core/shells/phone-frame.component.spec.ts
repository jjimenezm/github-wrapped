import { Component, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { installMatchMedia } from '../../../testing/match-media';
import { DESKTOP_QUERY } from '../breakpoint.service';
import { PhoneFrameComponent } from './phone-frame.component';

@Component({
  imports: [PhoneFrameComponent],
  template: `<gw-phone-frame><p class="probe">mobile tree</p></gw-phone-frame>`,
})
class HostComponent {}

function renderHtml(platform: 'browser' | 'server', desktop: boolean): string {
  TestBed.resetTestingModule();
  const media = installMatchMedia({ [DESKTOP_QUERY]: desktop });
  try {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: PLATFORM_ID, useValue: platform }],
    });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).innerHTML;
  } finally {
    media.restore();
  }
}

function mediaTextsFor(selectorPart: string): string[] {
  const found: string[] = [];
  const walk = (rules: CSSRuleList, media: string) => {
    for (const rule of [...rules]) {
      if (rule instanceof CSSMediaRule) walk(rule.cssRules, rule.media.mediaText);
      else if (rule instanceof CSSStyleRule && rule.selectorText.includes(selectorPart))
        found.push(media);
    }
  };
  for (const sheet of [...document.styleSheets]) walk(sheet.cssRules, '');
  return found;
}

describe('PhoneFrameComponent', () => {
  it('renders the mobile tree inside the phone screen', () => {
    const html = renderHtml('browser', true);
    const el = document.createElement('div');
    el.innerHTML = html;

    expect(el.querySelector('gw-phone-frame .pf-screen .probe')?.textContent).toBe('mobile tree');
  });

  it('produces the same HTML on the server and in a desktop or mobile browser', () => {
    const server = renderHtml('server', false);

    expect(renderHtml('browser', true)).toBe(server);
    expect(renderHtml('browser', false)).toBe(server);
  });

  it('draws the device only from the desktop breakpoint up', () => {
    renderHtml('browser', true);

    const media = mediaTextsFor('.pf-device');
    expect(media.length).toBeGreaterThan(0);
    expect(media.every((m) => m === DESKTOP_QUERY)).toBe(true);
  });
});
