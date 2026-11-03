import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/i18n.providers';
import { UiSampleComponent } from './ui-sample.component';

describe('UiSampleComponent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  async function render() {
    TestBed.configureTestingModule({ imports: [UiSampleComponent], providers: [provideI18n()] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    const fixture = TestBed.createComponent(UiSampleComponent);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows every primitive', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CL']);
    const { el } = await render();

    expect(el.querySelector('gw-locale-switch')).not.toBeNull();
    expect(el.querySelectorAll('gw-glass-panel').length).toBeGreaterThan(0);
    expect(el.querySelectorAll('gw-chip').length).toBeGreaterThan(0);
    expect(el.querySelectorAll('gw-icon-button').length).toBeGreaterThan(0);
    expect(el.querySelectorAll('gw-grid-loader .gl-cell')).toHaveLength(9);
  });

  it('switches every label between Spanish and English', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CL']);
    const { el } = await render();
    const heading = () => el.querySelector('h1')?.textContent?.trim();
    const spanish = heading();

    const en = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'EN');
    en?.click();

    await expect.poll(heading).not.toBe(spanish);
    // Transloco prints the key itself when a translation is missing.
    expect(el.textContent).not.toMatch(/\b(sample|loader|locale)\.[a-z]/);
  });
});
