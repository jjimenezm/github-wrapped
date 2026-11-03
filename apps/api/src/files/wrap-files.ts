import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { isWrapId } from '../wraps/wraps.repository';

/** The files of each wrap live in `<FILES_DIR>/<wrapId>/`; deleting a wrap deletes that folder. */
export interface WrapFileStore {
  remove(wrapId: string): Promise<void>;
}

export const WRAP_FILES = Symbol('WRAP_FILES');

export class WrapFiles implements WrapFileStore {
  constructor(private readonly root: string) {}

  async remove(wrapId: string): Promise<void> {
    // Only a UUID becomes a path, so nothing outside the wrap's folder can ever be touched.
    if (!isWrapId(wrapId)) throw new Error(`"${wrapId}" is not a wrap id`);
    await rm(join(this.root, wrapId), { recursive: true, force: true });
  }
}
