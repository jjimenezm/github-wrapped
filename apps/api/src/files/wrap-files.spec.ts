import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WrapFiles } from './wrap-files';

const ID = '3f0c8a52-1b9e-4c7a-9d10-5e2f6b7a8c9d';

describe('WrapFiles', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'wrap-files-'));
  });

  it('deletes every file of a wrap and leaves the others', async () => {
    await mkdir(join(root, ID, 'img', '1'), { recursive: true });
    await writeFile(join(root, ID, 'img', '1', 'card.png'), 'png');
    await mkdir(join(root, 'another-wrap'));
    await new WrapFiles(root).remove(ID);
    expect(await readdir(root)).toEqual(['another-wrap']);
  });

  it('does nothing when the wrap has no files yet', async () => {
    await expect(new WrapFiles(root).remove(ID)).resolves.toBeUndefined();
  });

  it.each(['..', '../etc', 'a/b', ''])('refuses an id that is not a wrap id (%p)', async (id) => {
    await expect(new WrapFiles(root).remove(id)).rejects.toThrow(/wrap id/);
  });
});
