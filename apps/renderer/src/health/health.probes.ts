import type { HealthProbe } from '@wrapped/shared';
import type { Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * The shared files volume takes a write. With `requireMount`, FILES_DIR must also be a mount point
 * (another device than its parent): a renderer started without the volume would otherwise write
 * into its own container layer, and the api would never find the PNGs.
 */
export function volumeProbe(filesDir: string, { requireMount = false } = {}): HealthProbe {
  return {
    name: 'volume',
    check: async () => {
      if (requireMount) {
        const [dir, parent] = await Promise.all([stat(filesDir), stat(dirname(filesDir))]);
        if (dir.dev === parent.dev) throw new Error(`${filesDir} is not a mounted volume`);
      }
      // A dotfile: the api never serves dotfiles, and wrap folders are UUIDs.
      const marker = join(filesDir, `.health-${randomUUID()}`);
      await writeFile(marker, 'ok');
      await rm(marker, { force: true });
    },
  };
}

/** The queue's Redis, through the worker's own connection (any round trip proves it answers). */
export function redisProbe(worker: () => Worker | undefined): HealthProbe {
  return {
    name: 'redis',
    check: async () => {
      const running = worker();
      if (!running) throw new Error('the images worker has not started');
      await (await running.client).get('health:probe');
    },
  };
}
