import { seedFor } from '@wrapped/art';
import { publicWrapUrl, type WrapSnapshot } from '@wrapped/shared';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RenderableWrap } from '../images/render-store';

/** A wrap that can be rendered: published, with its snapshot. */
export type VideoWrap = RenderableWrap & { snapshot: WrapSnapshot };

/**
 * The variables of the wrap video, as compositions/wrap/variables.schema.json defines them: the
 * snapshot as a JSON string (HyperFrames variables are never objects), the language, the public
 * URL its QR encodes, the art's seed, and the avatar as a data URI (`''` draws the initial; the
 * render has no network).
 */
export function videoVariables(
  wrap: VideoWrap,
  options: { publicBaseUrl: string; avatar?: string | null },
): Record<string, unknown> {
  const { snapshot } = wrap;
  return {
    snapshot: JSON.stringify(snapshot),
    locale: wrap.locale,
    url: publicWrapUrl(options.publicBaseUrl, wrap.login, wrap.year),
    seed: seedFor(snapshot.githubUserId, wrap.year),
    avatar: options.avatar ?? '',
  };
}

const DECLARED = /data-composition-variables\s*=\s*(["'])([\s\S]*?)\1/;
const ENTITIES: Record<string, string> = {
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&amp;': '&',
};

/**
 * The ids a composition declares in `data-composition-variables` on its index.html, the list
 * HyperFrames checks `--variables` against. Null when it declares none.
 */
export async function declaredVariables(composition: string): Promise<string[] | null> {
  const html = await readFile(join(composition, 'index.html'), 'utf8');
  const match = DECLARED.exec(html);
  if (!match?.[2]) return null;
  const json = match[2].replace(/&quot;|&#39;|&apos;|&amp;/g, (entity) => ENTITIES[entity] ?? '');
  const declared = JSON.parse(json) as Array<{ id: string }>;
  return declared.map((variable) => variable.id);
}

/**
 * Only what the composition declares. A declared variable the renderer can't give would render
 * with its default (the demo's data, on someone's video), so that is an error, not a warning.
 */
export function pickDeclared(
  variables: Record<string, unknown>,
  declared: string[] | null,
): Record<string, unknown> {
  if (!declared) return variables;
  const missing = declared.filter((id) => !(id in variables));
  if (missing.length) {
    throw new Error(
      `The composition declares variables the renderer can't give: ${missing.join(', ')}`,
    );
  }
  return Object.fromEntries(declared.map((id) => [id, variables[id]]));
}
