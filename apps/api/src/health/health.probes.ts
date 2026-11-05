import type { HealthProbe } from '@wrapped/shared';
import { RedisStore, type KeyValueStore } from '../common/store';
import { PrismaWrapsRepository } from '../wraps/prisma-wraps.repository';
import type { WrapsRepository } from '../wraps/wraps.repository';

/**
 * What the api depends on, asked through the very clients it uses. In memory (tests, local
 * development without Docker) there is nothing to lose, so nothing to check.
 */
export function healthProbes(wraps: WrapsRepository, store: KeyValueStore): HealthProbe[] {
  const probes: HealthProbe[] = [];
  if (wraps instanceof PrismaWrapsRepository)
    probes.push({ name: 'postgres', check: () => wraps.ping() });
  if (store instanceof RedisStore) probes.push({ name: 'redis', check: () => store.ping() });
  return probes;
}
