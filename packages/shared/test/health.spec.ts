import { checkHealth, type HealthProbe } from '../src';

const up = (name: string): HealthProbe => ({ name, check: () => Promise.resolve() });
const down = (name: string): HealthProbe => ({
  name,
  check: () => Promise.reject(new Error('connect ECONNREFUSED 10.0.1.5:6379')),
});
const hangs = (name: string): HealthProbe => ({ name, check: () => new Promise(() => {}) });

describe('checkHealth', () => {
  it('is ok when every dependency answers', async () => {
    expect(await checkHealth([up('postgres'), up('redis')])).toEqual({
      status: 'ok',
      checks: { postgres: 'up', redis: 'up' },
    });
  });

  it('names the dependency that failed and keeps the others', async () => {
    expect(await checkHealth([up('postgres'), down('redis')])).toEqual({
      status: 'error',
      checks: { postgres: 'up', redis: 'down' },
    });
  });

  it('counts a dependency that does not answer in time as down', async () => {
    const started = Date.now();
    const report = await checkHealth([hangs('redis'), up('volume')], { timeoutMs: 50 });
    expect(report).toEqual({ status: 'error', checks: { redis: 'down', volume: 'up' } });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('never exposes why a dependency failed (hosts and ports stay private)', async () => {
    const report = await checkHealth([down('redis')]);
    expect(JSON.stringify(report)).not.toContain('10.0.1.5');
  });

  it('hands each failure to the caller, for its own logs', async () => {
    const failures: string[] = [];
    await checkHealth([down('redis'), hangs('postgres')], {
      timeoutMs: 20,
      onFailure: (name, reason) => failures.push(`${name}: ${String(reason)}`),
    });
    expect(failures.sort()).toEqual([
      'postgres: Error: no answer within 20 ms',
      'redis: Error: connect ECONNREFUSED 10.0.1.5:6379',
    ]);
  });
});
