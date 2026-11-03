/**
 * Controllable `window.matchMedia` for jsdom, which doesn't implement it.
 * `set(query, matches)` flips a query and notifies its `change` listeners.
 */
export interface FakeMatchMedia {
  set(query: string, matches: boolean): void;
  calls: string[];
  restore(): void;
}

export function installMatchMedia(initial: Record<string, boolean> = {}): FakeMatchMedia {
  const state = new Map(Object.entries(initial));
  const lists = new Map<string, Set<MediaQueryList>>();
  const listeners = new WeakMap<MediaQueryList, Set<(event: MediaQueryListEvent) => void>>();
  const calls: string[] = [];
  const original = window.matchMedia;

  window.matchMedia = (query: string): MediaQueryList => {
    calls.push(query);
    const own = new Set<(event: MediaQueryListEvent) => void>();
    const list = {
      media: query,
      get matches() {
        return state.get(query) ?? false;
      },
      onchange: null,
      addEventListener: (_type: string, fn: (event: MediaQueryListEvent) => void) => own.add(fn),
      removeEventListener: (_type: string, fn: (event: MediaQueryListEvent) => void) =>
        own.delete(fn),
      addListener: (fn: (event: MediaQueryListEvent) => void) => own.add(fn),
      removeListener: (fn: (event: MediaQueryListEvent) => void) => own.delete(fn),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
    listeners.set(list, own);
    if (!lists.has(query)) lists.set(query, new Set());
    lists.get(query)?.add(list);
    return list;
  };

  return {
    calls,
    set(query, matches) {
      state.set(query, matches);
      for (const list of lists.get(query) ?? []) {
        const event = { matches, media: query } as MediaQueryListEvent;
        for (const fn of listeners.get(list) ?? []) fn(event);
      }
    },
    restore() {
      window.matchMedia = original;
    },
  };
}
