import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newWrap } from '../src/wraps/wraps.repository.contract';
import type { WrapRecord } from '../src/wraps/wraps.repository';
import { createE2eApp, e2eConfig } from './e2e-app';

const PNG = Buffer.from('89504e470d0a1a0a-card', 'utf8');
const MP4 = Buffer.from('0123456789', 'utf8');

describe('GET /api/files (e2e)', () => {
  const config = e2eConfig();
  let t: Awaited<ReturnType<typeof createE2eApp>>;
  let wrap: WrapRecord;

  const put = async (relative: string, data: Buffer) => {
    const path = join(config.filesDir, wrap.id, relative);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, data);
  };

  beforeEach(async () => {
    t = await createE2eApp('2026-03-01T12:00:00Z', config);
    wrap = await t.repo.create(newWrap({ imagesVersion: 2, imagesReadyVersion: 2 }));
    await put('img/2/card.png', PNG);
    await put('img/2/og.png', PNG);
    await put('img/2/secret.txt', Buffer.from('should never be served'));
    await put('video/1.mp4', MP4);
  });

  afterEach(() => t.app.close());

  it('serves an image of a published wrap, cached forever', async () => {
    const res = await t.http().get(`/api/files/${wrap.id}/img/2/card.png`).expect(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(Buffer.from(res.body as Buffer)).toEqual(PNG);
    await t.http().get(`/api/files/${wrap.id}/img/2/og.png`).expect(200);
  });

  it('answers byte ranges of the video, which Safari on iPhone needs to play it', async () => {
    const res = await t
      .http()
      .get(`/api/files/${wrap.id}/video/1.mp4`)
      .set('Range', 'bytes=0-1')
      .expect(206);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-range']).toBe('bytes 0-1/10');
    expect(res.headers['content-type']).toBe('video/mp4');
    expect(Buffer.from(res.body as Buffer).toString()).toBe('01');
  });

  it('answers 410 for every file of a deleted wrap', async () => {
    await t.repo.update(wrap.id, { status: 'deleted', snapshot: null }, wrap);
    await t.http().get(`/api/files/${wrap.id}/img/2/card.png`).expect(410);
    await t.http().get(`/api/files/${wrap.id}/video/1.mp4`).expect(410);
  });

  it('answers 404 for a version that was swept or never rendered', async () => {
    await t.http().get(`/api/files/${wrap.id}/img/1/card.png`).expect(404);
  });

  it('answers 404 for a wrap that does not exist', async () => {
    await t
      .http()
      .get('/api/files/3f0c8a52-1b9e-4c7a-9d10-5e2f6b7a8c9d/img/2/card.png')
      .expect(404);
  });

  it.each([
    ['an escaped path', 'img/2/..%2F..%2F..%2Fetc%2Fpasswd'],
    ['a dot-dot segment', 'img/2/%2E%2E'],
    ['a name outside the allow-list (even if it exists)', 'img/2/secret.txt'],
    ['a version that is not a number', 'img/abc/card.png'],
    ['version zero', 'img/0/card.png'],
    ['a video that is not <version>.mp4', 'video/1.mov'],
    ['an unknown kind of file', 'misc/2/card.png'],
  ])('answers 404 for %s', async (_, path) => {
    await t.http().get(`/api/files/${wrap.id}/${path}`).expect(404);
  });

  it('answers 404 for a wrap id that is not an id', async () => {
    await t.http().get('/api/files/..%2F..%2Fetc/img/2/card.png').expect(404);
  });
});
