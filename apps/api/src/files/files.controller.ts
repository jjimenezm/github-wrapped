import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../config';
import { WrapDeletedError } from '../wraps/wrap.errors';
import { isWrapId, WRAPS_REPOSITORY, type WrapsRepository } from '../wraps/wraps.repository';

export class FileNotFoundError extends Error {
  constructor() {
    super('There is no such file.');
    this.name = 'FileNotFoundError';
  }
}

const IMAGE_NAMES = new Set(['card.png', 'og.png']);
const VERSION = /^[1-9]\d{0,8}$/;
const VIDEO = /^[1-9]\d{0,8}\.mp4$/;
/** A version's files never change: a new render gets a new version, so caches can keep them. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * The PNGs and MP4s of published wraps. Only a wrap id, a positive version and an allow-listed
 * name ever become a path, and `sendFile` is rooted at FILES_DIR, so nothing else on the
 * container (the environment with every secret, for one) can be read through here.
 */
@Controller('files')
export class FilesController {
  constructor(
    @Inject(WRAPS_REPOSITORY) private readonly wraps: WrapsRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get(':wrapId/img/:version/:name')
  image(
    @Param('wrapId') wrapId: string,
    @Param('version') version: string,
    @Param('name') name: string,
    @Res() response: Response,
  ): Promise<void> {
    if (!isWrapId(wrapId) || !VERSION.test(version) || !IMAGE_NAMES.has(name)) {
      throw new FileNotFoundError();
    }
    return this.send(response, wrapId, `${wrapId}/img/${version}/${name}`);
  }

  /** Byte ranges included: Safari on iPhone won't play an MP4 without them. */
  @Get(':wrapId/video/:file')
  video(
    @Param('wrapId') wrapId: string,
    @Param('file') file: string,
    @Res() response: Response,
  ): Promise<void> {
    if (!isWrapId(wrapId) || !VIDEO.test(file)) throw new FileNotFoundError();
    return this.send(response, wrapId, `${wrapId}/video/${file}`);
  }

  private async send(response: Response, wrapId: string, relativePath: string): Promise<void> {
    const wrap = await this.wraps.findById(wrapId);
    if (!wrap) throw new FileNotFoundError();
    if (wrap.status === 'deleted') throw new WrapDeletedError();
    await new Promise<void>((resolve) => {
      response.sendFile(
        relativePath,
        {
          root: this.config.filesDir,
          dotfiles: 'deny',
          acceptRanges: true,
          cacheControl: false,
          headers: { 'Cache-Control': IMMUTABLE },
        },
        (error) => {
          if (error && !response.headersSent) {
            response
              .status(404)
              .json({ statusCode: 404, code: 'FILE_NOT_FOUND', message: 'There is no such file.' });
          }
          resolve();
        },
      );
    });
  }
}
