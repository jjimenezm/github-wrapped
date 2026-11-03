import { access, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const WRAP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type ImageName = 'card.png' | 'og.png';

/** `<FILES_DIR>/<wrapId>/img/<version>/<name>`, the layout the api serves from. */
export class ImageFiles {
  constructor(private readonly root: string) {}

  private dir(wrapId: string, version?: number) {
    if (!WRAP_ID.test(wrapId)) throw new Error(`"${wrapId}" is not a wrap id`);
    const images = join(this.root, wrapId, 'img');
    return version === undefined ? images : join(images, String(version));
  }

  /** Written next to its final name and renamed into place, so nobody downloads half a PNG. */
  async write(wrapId: string, version: number, name: ImageName, data: Buffer): Promise<void> {
    const dir = this.dir(wrapId, version);
    await mkdir(dir, { recursive: true });
    const temporary = join(dir, `.${name}.${process.pid}.tmp`);
    await writeFile(temporary, data);
    await rename(temporary, join(dir, name));
  }

  async has(wrapId: string, version: number): Promise<boolean> {
    try {
      await access(join(this.dir(wrapId, version), 'card.png'));
      return true;
    } catch {
      return false;
    }
  }

  /** Deletes the image versions older than `keep`; the video folder is never touched. */
  async sweep(wrapId: string, keep: number): Promise<void> {
    const images = this.dir(wrapId);
    const versions = await readdir(images).catch(() => [] as string[]);
    await Promise.all(
      versions
        .filter((name) => /^\d+$/.test(name) && Number(name) < keep)
        .map((name) => rm(join(images, name), { recursive: true, force: true })),
    );
  }
}
