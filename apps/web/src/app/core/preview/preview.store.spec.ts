import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { demoSnapshot } from '../../../testing/snapshot';
import { PreviewStore, requirePreview } from './preview.store';

describe('PreviewStore', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  const guard = () => TestBed.runInInjectionContext(() => requirePreview({} as never, {} as never));

  it('starts empty and holds the last snapshot looked up', () => {
    const store = TestBed.inject(PreviewStore);
    const snapshot = demoSnapshot();

    expect(store.snapshot()).toBeNull();
    store.set(snapshot);
    expect(store.snapshot()).toBe(snapshot);
  });

  it('sends someone without a snapshot (a reload, a shared link) back to the entry', () => {
    const result = guard();

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/');
  });

  it('lets the reveal open once there is a snapshot', () => {
    TestBed.inject(PreviewStore).set(demoSnapshot());

    expect(guard()).toBe(true);
  });
});
