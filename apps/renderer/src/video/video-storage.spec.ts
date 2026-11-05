import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WRAP_ID } from '../../test/fixtures';
import { VolumeVideoStorage } from './video-storage';

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'videos-'));
  const storage = new VolumeVideoStorage(root);
  const source = async (name: string, content = name) => {
    const path = join(root, `${name}.tmp`);
    await writeFile(path, content);
    return path;
  };
  return { root, storage, source, dir: join(root, WRAP_ID, 'video') };
}

describe('VolumeVideoStorage', () => {
  it('moves the finished MP4 to <wrap>/video/<version>.mp4, where the api serves it', async () => {
    const t = await setup();
    const source = await t.source('render', 'mp4 bytes');
    await t.storage.publish(WRAP_ID, 3, source);
    expect(await readFile(join(t.dir, '3.mp4'), 'utf8')).toBe('mp4 bytes');
    expect(await t.storage.has(WRAP_ID, 3)).toBe(true);
    expect(await t.storage.has(WRAP_ID, 4)).toBe(false);
    await expect(readFile(source)).rejects.toThrow(/ENOENT/);
  });

  it('sweeps the versions older than the ready one only', async () => {
    const t = await setup();
    for (const version of [1, 2, 3]) {
      await t.storage.publish(WRAP_ID, version, await t.source(`v${version}`));
    }
    await t.storage.sweep(WRAP_ID, 2);
    expect((await readdir(t.dir)).sort()).toEqual(['2.mp4', '3.mp4']);
  });

  it('lists the videos of every wrap folder, and nothing else on the volume', async () => {
    const t = await setup();
    const other = '9b7f730f-33b2-47f0-863f-51a07d0b6bdd';
    await t.storage.publish(WRAP_ID, 1, await t.source('a'));
    await t.storage.publish(WRAP_ID, 3, await t.source('b'));
    await t.storage.publish(other, 2, await t.source('c'));
    await mkdir(join(t.root, '.renders', 'x'), { recursive: true });
    await mkdir(join(t.root, WRAP_ID, 'img', '1'), { recursive: true });

    const listed = await t.storage.list();
    expect(listed).toHaveLength(3);
    expect(listed).toEqual(
      expect.arrayContaining([
        { wrapId: WRAP_ID, version: 1 },
        { wrapId: WRAP_ID, version: 3 },
        { wrapId: other, version: 2 },
      ]),
    );
    await t.storage.purge(WRAP_ID);
    expect(await t.storage.list()).toEqual([{ wrapId: other, version: 2 }]);
  });

  it('removes one version, and never builds a path from something that is not a wrap id', async () => {
    const t = await setup();
    await t.storage.publish(WRAP_ID, 1, await t.source('v1'));
    await t.storage.remove(WRAP_ID, 1);
    expect(await t.storage.has(WRAP_ID, 1)).toBe(false);
    await expect(t.storage.publish('../etc', 1, 'x')).rejects.toThrow(/not a wrap id/);
  });
});
