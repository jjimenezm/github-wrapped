import { access, copyFile, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { RendererConfig } from '../config';
import { R2VideoStorage } from './r2-video-storage';

const WRAP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VIDEO_FILE = /^(\d+)\.mp4$/;

/** One stored MP4. */
export interface StoredVideo {
  wrapId: string;
  version: number;
}

/**
 * Where finished videos live, one MP4 per data version. The processor renders into a work folder
 * and hands the finished file over; nothing half-written is ever public.
 */
export interface VideoStorage {
  /** Makes the MP4 at `source` the version's video; the source file is consumed. */
  publish(wrapId: string, version: number, source: string): Promise<void>;
  has(wrapId: string, version: number): Promise<boolean>;
  remove(wrapId: string, version: number): Promise<void>;
  /** Deletes the versions older than `keep`, once `keep` is ready. */
  sweep(wrapId: string, keep: number): Promise<void>;
  /** Deletes every video of a wrap (it was deleted). */
  purge(wrapId: string): Promise<void>;
  /** Every stored video, for the daily sweep. */
  list(): Promise<StoredVideo[]>;
}

export const VIDEO_STORAGE = Symbol('VIDEO_STORAGE');

/** `<FILES_DIR>/<wrapId>/video/<version>.mp4`, which the api serves with byte ranges. */
export class VolumeVideoStorage implements VideoStorage {
  constructor(private readonly root: string) {}

  private dir(wrapId: string) {
    if (!WRAP_ID.test(wrapId)) throw new Error(`"${wrapId}" is not a wrap id`);
    return join(this.root, wrapId, 'video');
  }

  private file(wrapId: string, version: number) {
    return join(this.dir(wrapId), `${version}.mp4`);
  }

  async publish(wrapId: string, version: number, source: string): Promise<void> {
    const dir = this.dir(wrapId);
    await mkdir(dir, { recursive: true });
    try {
      await rename(source, this.file(wrapId, version));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      // The work folder is on another disk: copy next to the final name, then rename.
      const temporary = join(dir, `.${version}.mp4.${process.pid}.tmp`);
      await copyFile(source, temporary);
      await rename(temporary, this.file(wrapId, version));
      await rm(source, { force: true });
    }
  }

  async has(wrapId: string, version: number): Promise<boolean> {
    try {
      await access(this.file(wrapId, version));
      return true;
    } catch {
      return false;
    }
  }

  async remove(wrapId: string, version: number): Promise<void> {
    await rm(this.file(wrapId, version), { force: true });
  }

  async purge(wrapId: string): Promise<void> {
    await rm(this.dir(wrapId), { recursive: true, force: true });
  }

  async list(): Promise<StoredVideo[]> {
    const wraps = (await readdir(this.root).catch(() => [] as string[])).filter((name) =>
      WRAP_ID.test(name),
    );
    const found = await Promise.all(
      wraps.map(async (wrapId) =>
        (await readdir(this.dir(wrapId)).catch(() => [] as string[]))
          .map((name) => VIDEO_FILE.exec(name)?.[1])
          .filter((version): version is string => version !== undefined)
          .map((version) => ({ wrapId, version: Number(version) })),
      ),
    );
    return found.flat();
  }

  async sweep(wrapId: string, keep: number): Promise<void> {
    const dir = this.dir(wrapId);
    const names = await readdir(dir).catch(() => [] as string[]);
    await Promise.all(
      names
        .filter((name) => Number(VIDEO_FILE.exec(name)?.[1] ?? keep) < keep)
        .map((name) => rm(join(dir, name), { force: true })),
    );
  }
}

/** The media bucket when it is configured, the files volume otherwise. */
export function createVideoStorage(config: RendererConfig): VideoStorage {
  return config.video.bucket
    ? new R2VideoStorage(config.video.bucket)
    : new VolumeVideoStorage(config.filesDir);
}
