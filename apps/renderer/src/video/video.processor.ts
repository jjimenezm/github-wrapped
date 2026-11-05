import { Logger } from '@nestjs/common';
import type { VideoJob } from '@wrapped/shared';
import { cp, mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { LowMemoryMode } from '../config';
import type { RenderStore } from '../images/render-store';
import { declaredVariables, pickDeclared, videoVariables, type VideoWrap } from './composition';
import type { RenderVideo } from './hyperframes';
import type { VideoStorage } from './video-storage';

const logger = new Logger('VideoProcessor');

export interface VideoProcessorDeps {
  store: RenderStore;
  storage: VideoStorage;
  render: RenderVideo;
  /** The avatar as a data URI, or null (the video then draws the login's initial). */
  avatars: (avatarUrl: string) => Promise<string | null>;
  publicBaseUrl: string;
  /** The HyperFrames project, copied for each render. */
  composition: string;
  /** Each render gets a folder here, deleted when it ends however it ends. */
  workDir: string;
  timeoutMs: number;
  lowMemory: LowMemoryMode;
}

/** Whether an earlier attempt of this job failed (BullMQ's retry, or the owner's). */
export interface VideoAttempt {
  retry: boolean;
}

export type VideoOutcome = 'rendered' | 'skipped';

/** What HyperFrames leaves next to a composition rendered or previewed in place. */
const LOCAL_STATE = /(^|[\\/])(\.hyperframes|renders)([\\/]|$)/;

const published = (wrap: Awaited<ReturnType<RenderStore['findForRender']>>): wrap is VideoWrap =>
  wrap?.status === 'published' && wrap.snapshot !== null;

/**
 * One `video` job: the 30-second MP4 of a wrap's data version. It renders in a work folder and,
 * only if the wrap is still published when it ends, becomes the ready video; the previous one is
 * deleted only then, so the public page never loses its video while a new one renders.
 */
export class VideoProcessor {
  constructor(private readonly deps: VideoProcessorDeps) {}

  async process(
    { wrapId, dataVersion }: VideoJob,
    attempt: VideoAttempt = { retry: false },
  ): Promise<VideoOutcome> {
    const { store, storage } = this.deps;
    const wrap = await store.findForRender(wrapId);
    // Deleted, gone, or regenerated since: the newer data's job does the work.
    if (!published(wrap) || wrap.dataVersion !== dataVersion) return 'skipped';
    // A render that finished but stopped before saying so (the worker restarted): no second render.
    if (await storage.has(wrapId, dataVersion)) {
      await this.ready(wrapId, dataVersion);
      return 'skipped';
    }

    await store.markVideoRendering(wrapId, dataVersion);
    await mkdir(this.deps.workDir, { recursive: true });
    const work = await mkdtemp(join(this.deps.workDir, `${wrapId}-${dataVersion}-`));
    try {
      const output = await this.render(wrap, work, attempt);
      // Deleted while rendering: the MP4 never reaches the files.
      if (!published(await store.findForRender(wrapId))) return 'skipped';
      await storage.publish(wrapId, dataVersion, output);
      return (await this.ready(wrapId, dataVersion)) ? 'rendered' : 'skipped';
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  /** Called once retries ran out (or the render timed out): failed, unless newer data came. */
  async fail({ wrapId, dataVersion }: VideoJob): Promise<void> {
    await this.deps.store.markVideoFailed(wrapId, dataVersion);
  }

  /**
   * Work folders a stopped worker left behind (killed mid-render, say). Only folders older than
   * twice the render timeout go: during a deploy, another worker may still be rendering in a
   * newer one. A folder that vanishes meanwhile is no reason to stop the worker from starting.
   */
  async sweepWorkDir(now = Date.now()): Promise<void> {
    const { workDir, timeoutMs } = this.deps;
    const names = await readdir(workDir).catch(() => [] as string[]);
    await Promise.all(
      names.map(async (name) => {
        const path = join(workDir, name);
        const info = await stat(path).catch(() => null);
        if (info && now - info.mtimeMs > timeoutMs * 2) {
          await rm(path, { recursive: true, force: true });
        }
      }),
    );
  }

  private async render(wrap: VideoWrap, work: string, attempt: VideoAttempt): Promise<string> {
    const { composition, publicBaseUrl, lowMemory, timeoutMs, avatars } = this.deps;
    const declared = await declaredVariables(composition);
    // Fetched here, not in the render: the render runs without network.
    const avatar = declared?.includes('avatar') ? await avatars(wrap.snapshot.avatarUrl) : null;
    const variables = pickDeclared(videoVariables(wrap, { publicBaseUrl, avatar }), declared);
    // HyperFrames writes its state next to the project: each render works on its own copy,
    // without the state or the renders a local preview may have left in the source.
    const project = join(work, 'composition');
    await cp(composition, project, {
      recursive: true,
      dereference: true,
      filter: (source) => !LOCAL_STATE.test(relative(composition, source)),
    });
    const variablesFile = join(work, 'variables.json');
    await writeFile(variablesFile, JSON.stringify(variables));
    const output = join(work, 'video.mp4');
    await this.deps.render({
      project,
      variablesFile,
      output,
      lowMemory: lowMemory === 'always' || (lowMemory === 'retry' && attempt.retry),
      timeoutMs,
    });
    return output;
  }

  /**
   * Marks the version ready and sweeps older MP4s; takes the file back if the wrap is gone. The
   * video is published by then, so a failed sweep only logs: the daily sweep deletes what it left.
   */
  private async ready(wrapId: string, dataVersion: number): Promise<boolean> {
    const { store, storage } = this.deps;
    const readyVersion = await store.markVideoReady(wrapId, dataVersion);
    if (readyVersion === null) {
      await storage.remove(wrapId, dataVersion);
      return false;
    }
    try {
      await storage.sweep(wrapId, readyVersion);
    } catch (error) {
      logger.warn(`could not sweep older videos of ${wrapId}: ${(error as Error).message}`);
    }
    return true;
  }
}
