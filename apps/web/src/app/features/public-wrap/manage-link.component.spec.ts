import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/i18n.providers';
import { ManageLinkComponent } from './manage-link.component';

describe('ManageLinkComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  async function render() {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CL']);
    TestBed.configureTestingModule({ imports: [ManageLinkComponent], providers: [provideI18n()] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    const fixture = TestBed.createComponent(ManageLinkComponent);
    fixture.componentRef.setInput('login', 'ana-dev');
    fixture.componentRef.setInput('year', 2026);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('a');
  }

  it('starts the GitHub sign-in to manage that wrap, as a plain link', async () => {
    const link = await render();

    expect(link?.textContent?.trim()).toBe('¿Es tuyo? Gestionar');
    expect(link?.getAttribute('href')).toBe(
      '/api/auth/github?login=ana-dev&intent=manage&year=2026',
    );
  });

  it('is not followed by crawlers, which would start sign-ins', async () => {
    const link = await render();

    expect(link?.getAttribute('rel')).toBe('nofollow');
  });
});
