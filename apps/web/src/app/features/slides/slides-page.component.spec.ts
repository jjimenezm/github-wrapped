import { ApplicationInitStatus, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { installMatchMedia, type FakeMatchMedia } from '../../../testing/match-media';
import { demoSnapshot } from '../../../testing/snapshot';
import { provideI18n } from '../../core/i18n/i18n.providers';
import { PreviewStore } from '../../core/preview/preview.store';
import { PUBLISH_PATH, SlidesPageComponent } from './slides-page.component';

@Component({ template: '' })
class PublishStubComponent {}

describe('SlidesPageComponent', () => {
  let media: FakeMatchMedia;

  afterEach(() => {
    vi.restoreAllMocks();
    media.restore();
    localStorage.clear();
  });

  it('shows the looked-up year and hands over to choosing a card at the end', async () => {
    media = installMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CL']);
    TestBed.configureTestingModule({
      imports: [SlidesPageComponent],
      providers: [
        provideI18n(),
        provideRouter([{ path: PUBLISH_PATH.slice(1), component: PublishStubComponent }]),
      ],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    TestBed.inject(PreviewStore).set(demoSnapshot({ featured: [] }));
    const fixture = TestBed.createComponent(SlidesPageComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('@ana-dev');
    const next = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Elegir mi tarjeta',
    );
    next?.click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe(PUBLISH_PATH);
  });
});
