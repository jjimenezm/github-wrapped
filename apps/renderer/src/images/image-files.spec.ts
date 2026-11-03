import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WRAP_ID } from '../../test/fixtures';
import { ImageFiles } from './image-files';

describe('ImageFiles', () => {
  let root: string;
  let files: ImageFiles;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'image-files-'));
    files = new ImageFiles(root);
  });

  it('writes a version’s images under <wrap>/img/<version>/', async () => {
    await files.write(WRAP_ID, 3, 'card.png', Buffer.from('card'));
    expect(await readFile(join(root, WRAP_ID, 'img', '3', 'card.png'), 'utf8')).toBe('card');
    expect(await files.has(WRAP_ID, 3)).toBe(true);
    expect(await files.has(WRAP_ID, 2)).toBe(false);
  });

  it('never leaves a half-written file behind', async () => {
    await files.write(WRAP_ID, 1, 'og.png', Buffer.from('og'));
    expect(await readdir(join(root, WRAP_ID, 'img', '1'))).toEqual(['og.png']);
  });

  it('sweeps older image versions only, never the video folder', async () => {
    for (const version of [1, 2, 3])
      await files.write(WRAP_ID, version, 'card.png', Buffer.from('x'));
    await mkdir(join(root, WRAP_ID, 'video'), { recursive: true });
    await writeFile(join(root, WRAP_ID, 'video', '1.mp4'), 'mp4');
    await files.sweep(WRAP_ID, 3);
    expect(await readdir(join(root, WRAP_ID, 'img'))).toEqual(['3']);
    expect(await readdir(join(root, WRAP_ID, 'video'))).toEqual(['1.mp4']);
  });

  it('refuses ids that are not wrap ids', async () => {
    await expect(files.write('../../etc', 1, 'card.png', Buffer.from('x'))).rejects.toThrow(
      /wrap id/,
    );
  });
});
