import { chmod, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { redisProbe, volumeProbe } from './health.probes';

describe('volumeProbe', () => {
  it('passes when the files volume takes a write, and leaves nothing behind', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'volume-'));
    const probe = volumeProbe(dir);
    expect(probe.name).toBe('volume');
    await expect(probe.check()).resolves.toBeUndefined();
    expect(await readdir(dir)).toEqual([]);
  });

  it('fails when the volume is missing', async () => {
    const dir = join(tmpdir(), 'volume-that-does-not-exist', 'files');
    await expect(volumeProbe(dir).check()).rejects.toThrow();
  });

  it('fails when the volume is read-only', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'volume-ro-'));
    await chmod(dir, 0o555);
    try {
      await expect(volumeProbe(dir).check()).rejects.toThrow();
    } finally {
      await chmod(dir, 0o755);
    }
  });

  it('fails a plain folder when a mounted volume is required (the container layer is not shared)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'volume-'));
    await expect(volumeProbe(dir, { requireMount: true }).check()).rejects.toThrow(
      /not a mounted volume/,
    );
  });
});

describe('redisProbe', () => {
  it('fails while the images worker has not started', async () => {
    const probe = redisProbe(() => undefined);
    expect(probe.name).toBe('redis');
    await expect(probe.check()).rejects.toThrow(/not started/);
  });
});
