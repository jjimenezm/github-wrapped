/** GitHub logins: letters, digits and single inner hyphens, up to 39 characters. */
const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/;
const PROFILE_URL = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#]+)\/?(?:[?#].*)?$/;

/**
 * What a person types in the entry field (`@Ana-Dev`, a pasted profile URL…) as the lowercase
 * login used for lookups and cache keys, or null when it can't be a GitHub login (R1).
 */
export function normalizeLogin(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  const fromUrl = PROFILE_URL.exec(value);
  if (fromUrl?.[1]) value = fromUrl[1];
  else if (value.includes('/')) return null;
  value = value.replace(/^@/, '');
  return GITHUB_LOGIN.test(value) ? value : null;
}
