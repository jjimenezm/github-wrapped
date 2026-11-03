import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { demoSnapshot } from '../../../testing/snapshot';
import { PREVIEW_STORAGE_KEY, PreviewStore, requirePreview } from './preview.store';

describe('PreviewStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  const guard = () => TestBed.runInInjectionContext(() => requirePreview({} as never, {} as never));

  /** A fresh store in a fresh injector: what a full page load (the OAuth round trip) gets. */
  function reload(): PreviewStore {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    return TestBed.inject(PreviewStore);
  }

  it('starts empty and holds the last snapshot looked up', () => {
    const store = TestBed.inject(PreviewStore);
    const snapshot = demoSnapshot();

    expect(store.snapshot()).toBeNull();
    store.set(snapshot);
    expect(store.snapshot()).toBe(snapshot);
  });

  it('starts on Huella and remembers the card the person picks', () => {
    const store = TestBed.inject(PreviewStore);

    expect(store.style()).toBe('huella');
    store.setStyle('cordillera');
    expect(store.style()).toBe('cordillera');
  });

  it('survives the round trip to GitHub within the same tab', () => {
    const snapshot = demoSnapshot();
    const store = TestBed.inject(PreviewStore);
    store.set(snapshot);
    store.setStyle('constelacion');

    const after = reload();

    expect(after.snapshot()).toEqual(snapshot);
    expect(after.style()).toBe('constelacion');
    expect(sessionStorage.getItem(PREVIEW_STORAGE_KEY)).not.toBeNull();
  });

  it('ignores what it cannot read back', () => {
    sessionStorage.setItem(PREVIEW_STORAGE_KEY, '{not json');

    expect(TestBed.inject(PreviewStore).snapshot()).toBeNull();
  });

  it('keeps working in memory when storage is blocked', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const store = TestBed.inject(PreviewStore);
    const snapshot = demoSnapshot();

    store.set(snapshot);

    expect(store.snapshot()).toBe(snapshot);
  });

  it('sends someone without a snapshot (a reload in a new tab, a shared link) back to the entry', () => {
    const result = guard();

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/');
  });

  it('lets the reveal open once there is a snapshot', () => {
    TestBed.inject(PreviewStore).set(demoSnapshot());

    expect(guard()).toBe(true);
  });
});
