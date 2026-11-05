/** One dependency a service needs to do its job: Postgres, Redis, the files volume. */
export interface HealthProbe {
  name: string;
  /** Resolves when the dependency answers; rejects (or never settles) when it doesn't. */
  check(): Promise<unknown>;
}

export type DependencyState = 'up' | 'down';

/** What `GET /health` answers, on the api and on the renderer: 200 when ok, 503 otherwise. */
export interface HealthReport {
  status: 'ok' | 'error';
  checks: Record<string, DependencyState>;
}

export interface HealthOptions {
  /** A dependency slower than this counts as down (a stuck connection never settles). */
  timeoutMs?: number;
  /** Why a dependency is down, for the service's own logs; the report itself never says. */
  onFailure?: (name: string, reason: unknown) => void;
}

// This package compiles against plain ES (no DOM, no Node types); every runtime that uses it has
// timers, so only their shape is declared here.
declare function setTimeout(handler: () => void, ms: number): unknown;
declare function clearTimeout(id: unknown): void;

const DEFAULT_TIMEOUT_MS = 2_000;

function probe(
  { name, check }: HealthProbe,
  timeoutMs: number,
  onFailure?: HealthOptions['onFailure'],
): Promise<DependencyState> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (state: DependencyState, reason?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (state === 'down') onFailure?.(name, reason);
      resolve(state);
    };
    const timer = setTimeout(
      () => settle('down', new Error(`no answer within ${timeoutMs} ms`)),
      timeoutMs,
    );
    // Both outcomes are handled, so a check that fails after the timeout is never unhandled.
    check().then(
      () => settle('up'),
      (reason: unknown) => settle('down', reason),
    );
  });
}

/** Asks every dependency at once; a single one down makes the whole service unhealthy. */
export async function checkHealth(
  probes: readonly HealthProbe[],
  { timeoutMs = DEFAULT_TIMEOUT_MS, onFailure }: HealthOptions = {},
): Promise<HealthReport> {
  const results = await Promise.all(
    probes.map(async (p) => [p.name, await probe(p, timeoutMs, onFailure)] as const),
  );
  const checks: Record<string, DependencyState> = Object.fromEntries(results);
  return { status: results.some(([, state]) => state === 'down') ? 'error' : 'ok', checks };
}
