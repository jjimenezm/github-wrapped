const AVATAR_HOST = 'avatars.githubusercontent.com';
const TYPES = new Set(['image/png', 'image/jpeg']);
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5_000;

/** The card draws the avatar small; the video shows it at 232 px, so it asks for more. */
export const CARD_AVATAR_PX = 96;
export const VIDEO_AVATAR_PX = 256;

/**
 * The person's GitHub avatar as a data URI (`size` px square), or null to fall back to their
 * initial. Only GitHub's avatar host over https is ever fetched, so a snapshot can't make the
 * worker request anything else.
 */
export async function fetchAvatar(
  avatarUrl: string,
  fetch: typeof globalThis.fetch = globalThis.fetch,
  size = CARD_AVATAR_PX,
): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(avatarUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== AVATAR_HOST) return null;
  url.searchParams.set('s', String(size));

  try {
    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const type = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!response.ok || !TYPES.has(type)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_BYTES) return null;
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}
