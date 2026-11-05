import { VIDEO_OBJECT_ROOT, videoObjectKey, videoObjectPrefix } from '@wrapped/shared';
import { AwsClient } from 'aws4fetch';
import { readFile, rm } from 'node:fs/promises';
import type { StoredVideo, VideoStorage } from './video-storage';

const WRAP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The media bucket (Cloudflare R2, through its S3 API) and a key that can write to it. */
export interface MediaBucketConfig {
  /** `https://<account-id>.r2.cloudflarestorage.com` */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * A version never changes, so browsers keep it for good. Cloudflare's edge checks back every hour:
 * a video deleted from the bucket stops being served within the hour, with no cache purge.
 */
export const VIDEO_CACHE_CONTROL = 'public, max-age=31536000, s-maxage=3600, immutable';

/** Only a wrap id ever becomes a key, so nothing else in the bucket can be touched. */
function wrapKey(wrapId: string, version?: number): string {
  if (!WRAP_ID.test(wrapId)) throw new Error(`"${wrapId}" is not a wrap id`);
  return version === undefined ? videoObjectPrefix(wrapId) : videoObjectKey(wrapId, version);
}

/** `wrapped/<wrap id>/<version>.mp4`; any other key in the bucket is not this project's. */
const VIDEO_KEY =
  /^wrapped\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(\d+)\.mp4$/;

const KEY = /<Key>([^<]*)<\/Key>/g;
const NEXT = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/;
const xmlText = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/**
 * Videos in the media bucket, served by Cloudflare from its own domain (`PUBLIC_MEDIA_URL`) as
 * `wrapped/<wrapId>/<version>.mp4`: they never go through the server, whose firewall only lets
 * Cloudflare in. Only the renderer holds the bucket's key.
 */
export class R2VideoStorage implements VideoStorage {
  private readonly client: AwsClient;

  constructor(
    private readonly config: MediaBucketConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: 's3',
      region: 'auto',
    });
  }

  async publish(wrapId: string, version: number, source: string): Promise<void> {
    const body = await readFile(source);
    await this.send(this.objectUrl(wrapId, version), {
      method: 'PUT',
      body,
      headers: { 'Content-Type': 'video/mp4', 'Cache-Control': VIDEO_CACHE_CONTROL },
    });
    await rm(source, { force: true });
  }

  async has(wrapId: string, version: number): Promise<boolean> {
    const response = await this.send(this.objectUrl(wrapId, version), { method: 'HEAD' }, [404]);
    return response.status !== 404;
  }

  async remove(wrapId: string, version: number): Promise<void> {
    await this.send(this.objectUrl(wrapId, version), { method: 'DELETE' }, [404]);
  }

  async sweep(wrapId: string, keep: number): Promise<void> {
    const older = (await this.keys(wrapKey(wrapId))).filter((key) => {
      const version = Number(/\/(\d+)\.mp4$/.exec(key)?.[1] ?? keep);
      return version < keep;
    });
    await Promise.all(older.map((key) => this.deleteKey(key)));
  }

  /** Every video of a deleted wrap. */
  async purge(wrapId: string): Promise<void> {
    const keys = await this.keys(wrapKey(wrapId));
    await Promise.all(keys.map((key) => this.deleteKey(key)));
  }

  async list(): Promise<StoredVideo[]> {
    return (await this.keys(VIDEO_OBJECT_ROOT)).flatMap((key) => {
      const match = VIDEO_KEY.exec(key);
      return match?.[1] && match[2] ? [{ wrapId: match[1], version: Number(match[2]) }] : [];
    });
  }

  private objectUrl(wrapId: string, version: number): string {
    return this.keyUrl(wrapKey(wrapId, version));
  }

  private keyUrl(key: string): string {
    const path = key.split('/').map(encodeURIComponent).join('/');
    return `${this.config.endpoint}/${this.config.bucket}/${path}`;
  }

  private deleteKey(key: string): Promise<Response> {
    return this.send(this.keyUrl(key), { method: 'DELETE' }, [404]);
  }

  /** ListObjectsV2, page after page. */
  private async keys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const query = new URLSearchParams({ 'list-type': '2', prefix });
      if (token) query.set('continuation-token', token);
      const response = await this.send(
        `${this.config.endpoint}/${this.config.bucket}?${query.toString()}`,
        { method: 'GET' },
      );
      const xml = await response.text();
      for (const match of xml.matchAll(KEY)) keys.push(xmlText(match[1] ?? ''));
      token = xml.includes('<IsTruncated>true</IsTruncated>')
        ? xmlText(NEXT.exec(xml)?.[1] ?? '')
        : undefined;
    } while (token);
    return keys;
  }

  /** Signs and sends one request; an unexpected status fails with what R2 said. */
  private async send(url: string, init: RequestInit, allowed: number[] = []): Promise<Response> {
    const response = await this.fetchFn(await this.client.sign(url, init));
    if (!response.ok && !allowed.includes(response.status)) {
      const detail = init.method === 'HEAD' ? '' : (await response.text()).slice(0, 300);
      throw new Error(`R2 ${init.method} ${url} answered ${response.status} ${detail}`.trim());
    }
    return response;
  }
}
