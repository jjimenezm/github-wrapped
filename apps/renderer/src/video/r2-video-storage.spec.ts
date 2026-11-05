import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WRAP_ID } from '../../test/fixtures';
import { R2VideoStorage, VIDEO_CACHE_CONTROL, type MediaBucketConfig } from './r2-video-storage';

const CONFIG: MediaBucketConfig = {
  endpoint: 'https://account.r2.cloudflarestorage.com',
  bucket: 'media',
  accessKeyId: 'test-key-id',
  secretAccessKey: 'test-key-secret',
};
const OTHER = '9b7f730f-33b2-47f0-863f-51a07d0b6bdd';
const BUCKET_URL = `${CONFIG.endpoint}/${CONFIG.bucket}`;

/** Just enough of R2's S3 API: objects by key, and ListObjectsV2 two keys per page. */
function fakeR2(options: { failWith?: number } = {}) {
  const objects = new Map<string, { body: Buffer; headers: Headers }>();
  const requests: Request[] = [];
  const fetchFn = async (input: RequestInfo | URL): Promise<Response> => {
    const request = input as Request;
    requests.push(request);
    if (options.failWith)
      return new Response('<Error>AccessDenied</Error>', { status: options.failWith });
    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.replace(`/${CONFIG.bucket}/`, ''));
    if (request.method === 'GET' && url.searchParams.get('list-type') === '2') {
      const prefix = url.searchParams.get('prefix') ?? '';
      const all = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = Number(url.searchParams.get('continuation-token') ?? 0);
      const page = all.slice(start, start + 2);
      const more = start + 2 < all.length;
      const xml =
        `<ListBucketResult><IsTruncated>${more}</IsTruncated>` +
        page.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('') +
        (more ? `<NextContinuationToken>${start + 2}</NextContinuationToken>` : '') +
        `</ListBucketResult>`;
      return new Response(xml, { status: 200 });
    }
    switch (request.method) {
      case 'PUT':
        objects.set(key, {
          body: Buffer.from(await request.arrayBuffer()),
          headers: request.headers,
        });
        return new Response(null, { status: 200 });
      case 'HEAD':
        return new Response(null, { status: objects.has(key) ? 200 : 404 });
      case 'DELETE':
        objects.delete(key);
        return new Response(null, { status: 204 });
      default:
        return new Response(null, { status: 400 });
    }
  };
  return { objects, requests, fetchFn };
}

async function mp4(content = 'mp4 bytes') {
  const path = join(await mkdtemp(join(tmpdir(), 'r2-')), 'video.mp4');
  await writeFile(path, content);
  return path;
}

describe('R2VideoStorage', () => {
  it('uploads the MP4 as wrapped/<wrap>/<version>.mp4, signed, cacheable, then drops the local file', async () => {
    const r2 = fakeR2();
    const storage = new R2VideoStorage(CONFIG, r2.fetchFn);
    const source = await mp4();

    await storage.publish(WRAP_ID, 2, source);

    const stored = r2.objects.get(`wrapped/${WRAP_ID}/2.mp4`);
    expect(stored?.body.toString()).toBe('mp4 bytes');
    expect(stored?.headers.get('content-type')).toBe('video/mp4');
    expect(stored?.headers.get('cache-control')).toBe(VIDEO_CACHE_CONTROL);
    const put = r2.requests[0];
    expect(put?.url).toBe(`${BUCKET_URL}/wrapped/${WRAP_ID}/2.mp4`);
    expect(put?.headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 Credential=test-key-id\//);
    expect(put?.headers.get('authorization')).toContain('/auto/s3/aws4_request');
    // S3 signing without hashing the 12 MB body; R2 accepts it over HTTPS.
    expect(put?.headers.get('x-amz-content-sha256')).toBe('UNSIGNED-PAYLOAD');
    await expect(readFile(source)).rejects.toThrow(/ENOENT/);
  });

  it('tells a stored version from a missing one', async () => {
    const r2 = fakeR2();
    const storage = new R2VideoStorage(CONFIG, r2.fetchFn);
    await storage.publish(WRAP_ID, 1, await mp4());
    expect(await storage.has(WRAP_ID, 1)).toBe(true);
    expect(await storage.has(WRAP_ID, 2)).toBe(false);
  });

  it('sweeps the older versions of one wrap only, across pages of the listing', async () => {
    const r2 = fakeR2();
    const storage = new R2VideoStorage(CONFIG, r2.fetchFn);
    for (const version of [1, 2, 3, 4]) await storage.publish(WRAP_ID, version, await mp4());
    await storage.publish(OTHER, 1, await mp4());

    await storage.sweep(WRAP_ID, 4);

    expect([...r2.objects.keys()].sort()).toEqual(
      [`wrapped/${OTHER}/1.mp4`, `wrapped/${WRAP_ID}/4.mp4`].sort(),
    );
  });

  it('purges every video of a deleted wrap, and nothing of the others', async () => {
    const r2 = fakeR2();
    const storage = new R2VideoStorage(CONFIG, r2.fetchFn);
    for (const version of [1, 2, 3]) await storage.publish(WRAP_ID, version, await mp4());
    await storage.publish(OTHER, 1, await mp4());

    await storage.purge(WRAP_ID);
    await storage.remove(OTHER, 7);

    expect([...r2.objects.keys()]).toEqual([`wrapped/${OTHER}/1.mp4`]);
  });

  it('lists this project’s videos across pages, and nothing else in the bucket', async () => {
    const r2 = fakeR2();
    const storage = new R2VideoStorage(CONFIG, r2.fetchFn);
    for (const version of [1, 2]) await storage.publish(WRAP_ID, version, await mp4());
    await storage.publish(OTHER, 5, await mp4());
    r2.objects.set('backups/db.sql.gz', { body: Buffer.from(''), headers: new Headers() });
    r2.objects.set(`wrapped/${WRAP_ID}/notes.txt`, {
      body: Buffer.from(''),
      headers: new Headers(),
    });

    expect(
      (await storage.list()).sort((a, b) =>
        (a.wrapId + a.version).localeCompare(b.wrapId + b.version),
      ),
    ).toEqual(
      [
        { wrapId: WRAP_ID, version: 1 },
        { wrapId: WRAP_ID, version: 2 },
        { wrapId: OTHER, version: 5 },
      ].sort((a, b) => (a.wrapId + a.version).localeCompare(b.wrapId + b.version)),
    );
    expect(r2.requests.some((r) => r.url.includes('prefix=wrapped%2F'))).toBe(true);
  });

  it('fails with what R2 answered, and never builds a key from something that is not a wrap id', async () => {
    const storage = new R2VideoStorage(CONFIG, fakeR2({ failWith: 403 }).fetchFn);
    await expect(storage.publish(WRAP_ID, 1, await mp4())).rejects.toThrow(
      /R2 PUT .* answered 403 <Error>AccessDenied/,
    );
    await expect(storage.purge('../backups')).rejects.toThrow(/not a wrap id/);
  });
});
