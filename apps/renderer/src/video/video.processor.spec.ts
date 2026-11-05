import { mkdir, mkdtemp, readdir, readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE_URL, renderableWrap, WRAP_ID } from '../../test/fixtures';
import { DEFAULT_COMPOSITION, type LowMemoryMode } from '../config';
import { InMemoryRenderStore, type RenderableWrap } from '../images/render-store';
import type { RenderRequest } from './hyperframes';
import { VideoProcessor } from './video.processor';
import { VolumeVideoStorage } from './video-storage';

const MP4 = Buffer.from('fake mp4');

interface Options {
  wraps?: RenderableWrap[];
  lowMemory?: LowMemoryMode;
  /** Runs while the fake render is "rendering", before it writes the MP4. */
  during?: (t: { store: InMemoryRenderStore; root: string }) => Promise<void> | void;
  fail?: Error;
  composition?: string;
}

async function setup(options: Options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'video-'));
  const store = new InMemoryRenderStore(options.wraps ?? [renderableWrap()]);
  const storage = new VolumeVideoStorage(root);
  const requests: Array<RenderRequest & { variables: Record<string, unknown> }> = [];
  const workDir = join(root, '.renders');
  const render = jest.fn(async (request: RenderRequest) => {
    const variables = JSON.parse(await readFile(request.variablesFile, 'utf8')) as Record<
      string,
      unknown
    >;
    requests.push({ ...request, variables });
    await options.during?.({ store, root });
    if (options.fail) throw options.fail;
    await writeFile(request.output, MP4);
  });
  const avatars = jest.fn(() => Promise.resolve<string | null>('data:image/png;base64,QQ=='));
  const processor = new VideoProcessor({
    store,
    storage,
    render,
    avatars,
    publicBaseUrl: BASE_URL,
    composition: options.composition ?? DEFAULT_COMPOSITION,
    workDir,
    timeoutMs: 600_000,
    lowMemory: options.lowMemory ?? 'retry',
  });
  const video = (version: number) => join(root, WRAP_ID, 'video', `${version}.mp4`);
  const exists = (path: string) =>
    readFile(path).then(
      () => true,
      () => false,
    );
  return { root, store, storage, render, avatars, requests, processor, workDir, video, exists };
}

describe('VideoProcessor', () => {
  it('renders the data version into the files and marks it ready, leaving no work folder', async () => {
    const t = await setup();
    expect(await t.processor.process({ wrapId: WRAP_ID, dataVersion: 1 })).toBe('rendered');
    expect(await readFile(t.video(1))).toEqual(MP4);
    expect(t.store.get(WRAP_ID)).toMatchObject({ videoReadyVersion: 1, videoStatus: 'ready' });
    expect(await readdir(t.workDir)).toEqual([]);
  });

  it('gives the wrap composition its contract: snapshot as JSON text, URL, seed and avatar', async () => {
    const t = await setup({ wraps: [renderableWrap({ locale: 'en' })] });
    await t.processor.process({ wrapId: WRAP_ID, dataVersion: 1 });

    const variables = t.requests[0]?.variables ?? {};
    expect(Object.keys(variables).sort()).toEqual(['avatar', 'locale', 'seed', 'snapshot', 'url']);
    expect(variables).toMatchObject({
      locale: 'en',
      url: `${BASE_URL}/@ana-dev/2026`,
      avatar: 'data:image/png;base64,QQ==',
    });
    expect(JSON.parse(variables.snapshot as string)).toEqual(renderableWrap().snapshot);
    expect(t.avatars).toHaveBeenCalledWith('https://avatars.githubusercontent.com/u/4242');
  });

  it('asks GitHub for no avatar when the composition doesn’t show one', async () => {
    const composition = await mkdtemp(join(tmpdir(), 'composition-'));
    await writeFile(
      join(composition, 'index.html'),
      `<html data-composition-variables='[{"id":"locale"},{"id":"url"}]'></html>`,
    );
    const t = await setup({ composition });
    await t.processor.process({ wrapId: WRAP_ID, dataVersion: 1 });
    expect(t.avatars).not.toHaveBeenCalled();
  });

  it('renders with BeginFrame first and the low-memory profile on a retry', async () => {
    const t = await setup();
    await t.processor.process({ wrapId: WRAP_ID, dataVersion: 1 });
    await t.storage.remove(WRAP_ID, 1);
    await t.processor.process({ wrapId: WRAP_ID, dataVersion: 1 }, { retry: true });
    expect(t.requests.map((r) => r.lowMemory)).toEqual([false, true]);

    const always = await setup({ lowMemory: 'always' });
    await always.processor.process({ wrapId: WRAP_ID, dataVersion: 1 });
    expect(always.requests[0]?.lowMemory).toBe(true);
    const never = await setup({ lowMemory: 'never' });
    await never.processor.process({ wrapId: WRAP_ID, dataVersion: 1 }, { retry: true });
    expect(never.requests[0]?.lowMemory).toBe(false);
  });

  it('works on its own copy of the composition, without a local preview’s leftovers', async () => {
    const composition = await mkdtemp(join(tmpdir(), 'composition-'));
    await writeFile(join(composition, 'index.html'), '<html></html>');
    for (const dir of ['.hyperframes', 'renders', 'vendor']) {
      await mkdir(join(composition, dir));
      await writeFile(join(composition, dir, 'file'), dir);
    }
    let copied: string[] = [];
    const t = await setup({
      composition,
      during: async () => {
        copied = (await readdir(t.requests[0]?.project ?? '')).sort();
      },
    });
    await t.processor.process({ wrapId: WRAP_ID, dataVersion: 1 });
    expect(t.requests[0]?.project.startsWith(t.workDir)).toBe(true);
    expect(copied).toEqual(['index.html', 'vendor']);
  });

  it('publishes nothing when the wrap is deleted mid-render, and cleans the work folder', async () => {
    const t = await setup({
      during: ({ store }) => {
        const wrap = store.get(WRAP_ID);
        if (wrap) Object.assign(wrap, { status: 'deleted', snapshot: null });
      },
    });
    expect(await t.processor.process({ wrapId: WRAP_ID, dataVersion: 1 })).toBe('skipped');
    expect(await t.exists(t.video(1))).toBe(false);
    expect(await readdir(t.workDir)).toEqual([]);
    expect(t.store.get(WRAP_ID)?.videoReadyVersion).toBeNull();
  });

  it('keeps the old video playing until the regenerated one is ready, then deletes it', async () => {
    let oldDuringRender = false;
    const t = await setup({
      wraps: [renderableWrap({ dataVersion: 2, videoReadyVersion: 1, videoStatus: 'queued' })],
      during: async ({ root }) => {
        oldDuringRender = await readFile(join(root, WRAP_ID, 'video', '1.mp4')).then(
          () => true,
          () => false,
        );
      },
    });
    await mkdir(join(t.root, WRAP_ID, 'video'), { recursive: true });
    await writeFile(t.video(1), 'old');

    expect(await t.processor.process({ wrapId: WRAP_ID, dataVersion: 2 })).toBe('rendered');
    expect(oldDuringRender).toBe(true);
    expect(await t.exists(t.video(1))).toBe(false);
    expect(await readFile(t.video(2))).toEqual(MP4);
    expect(t.store.get(WRAP_ID)).toMatchObject({ videoReadyVersion: 2, videoStatus: 'ready' });
  });

  it('skips the video of data that was regenerated since, without rendering it', async () => {
    const t = await setup({ wraps: [renderableWrap({ dataVersion: 3 })] });
    expect(await t.processor.process({ wrapId: WRAP_ID, dataVersion: 2 })).toBe('skipped');
    expect(t.render).not.toHaveBeenCalled();
  });

  it('marks the status rendering while it works', async () => {
    let during: string | undefined;
    const t = await setup({
      during: ({ store }) => void (during = store.get(WRAP_ID)?.videoStatus),
    });
    await t.processor.process({ wrapId: WRAP_ID, dataVersion: 1 });
    expect(during).toBe('rendering');
  });

  it('does not render twice a video that is already in the files', async () => {
    const t = await setup();
    await mkdir(join(t.root, WRAP_ID, 'video'), { recursive: true });
    await writeFile(t.video(1), MP4);
    expect(await t.processor.process({ wrapId: WRAP_ID, dataVersion: 1 })).toBe('skipped');
    expect(t.render).not.toHaveBeenCalled();
    expect(t.store.get(WRAP_ID)?.videoStatus).toBe('ready');
  });

  it('cleans the work folder when the render fails, and marks failed once told to', async () => {
    const t = await setup({ fail: new Error('Chrome crashed') });
    await expect(t.processor.process({ wrapId: WRAP_ID, dataVersion: 1 })).rejects.toThrow(
      /Chrome crashed/,
    );
    expect(await readdir(t.workDir)).toEqual([]);
    expect(await t.exists(t.video(1))).toBe(false);
    await t.processor.fail({ wrapId: WRAP_ID, dataVersion: 1 });
    expect(t.store.get(WRAP_ID)?.videoStatus).toBe('failed');
  });

  it('refuses a composition that declares a variable the renderer can’t give', async () => {
    const composition = await mkdtemp(join(tmpdir(), 'composition-'));
    await writeFile(
      join(composition, 'index.html'),
      `<html data-composition-variables='[{"id":"url"},{"id":"mood"}]'></html>`,
    );
    const t = await setup({ composition });
    await expect(t.processor.process({ wrapId: WRAP_ID, dataVersion: 1 })).rejects.toThrow(/mood/);
    expect(t.render).not.toHaveBeenCalled();
  });

  it('sweeps work folders a stopped worker left, but not one another worker may be using', async () => {
    const t = await setup();
    const stale = join(t.workDir, 'stale');
    const fresh = join(t.workDir, 'fresh');
    await mkdir(stale, { recursive: true });
    await mkdir(fresh, { recursive: true });
    const now = Date.now();
    const anHourAgo = new Date(now - 60 * 60 * 1000);
    await utimes(stale, anHourAgo, anHourAgo);
    await t.processor.sweepWorkDir(now);
    expect(await readdir(t.workDir)).toEqual(['fresh']);
  });
});
