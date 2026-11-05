import { seedFor } from '@wrapped/art';
import Ajv2020 from 'ajv/dist/2020';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE_URL, renderableWrap, snapshot } from '../../test/fixtures';
import { DEFAULT_COMPOSITION } from '../config';
import { declaredVariables, pickDeclared, videoVariables, type VideoWrap } from './composition';

const wrap = renderableWrap() as VideoWrap;
const options = { publicBaseUrl: BASE_URL };
const AVATAR = 'data:image/png;base64,QQ==';

/** The wrap composition's own contract, the one its renders are checked against. */
const schema = JSON.parse(
  readFileSync(join(DEFAULT_COMPOSITION, 'variables.schema.json'), 'utf8'),
) as object;
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

describe('composition variables', () => {
  it('gives the snapshot as JSON text, the language, the public URL, the seed and the avatar', () => {
    const variables = videoVariables(wrap, { ...options, avatar: AVATAR });
    expect(variables).toEqual({
      snapshot: JSON.stringify(snapshot()),
      locale: 'es',
      url: 'https://wrapped.jjimenezm.dev/@ana-dev/2026',
      seed: seedFor(4242, 2026),
      avatar: AVATAR,
    });
  });

  it.each([
    ['with an avatar', AVATAR],
    ['without one (the video draws the initial)', null],
  ])('builds what the wrap composition’s schema accepts, %s', (_, avatar) => {
    const variables = videoVariables(renderableWrap({ locale: 'en' }) as VideoWrap, {
      ...options,
      avatar,
    });
    expect(validate(variables)).toBe(true);
    expect(validate.errors ?? []).toEqual([]);
  });

  it('keeps a hidden metric hidden, not zero', () => {
    const hidden = renderableWrap({
      snapshot: snapshot({ metrics: { ...snapshot().metrics, mergedPRs: null } }),
    }) as VideoWrap;
    const sent = JSON.parse(videoVariables(hidden, options).snapshot as string) as {
      metrics: Record<string, unknown>;
    };
    expect(sent.metrics.mergedPRs).toBeNull();
  });

  it('reads what a composition declares on its index.html', async () => {
    expect((await declaredVariables(DEFAULT_COMPOSITION))?.sort()).toEqual(
      ['avatar', 'locale', 'seed', 'snapshot', 'url'].sort(),
    );
    const quoted = await mkdtemp(join(tmpdir(), 'composition-'));
    await writeFile(
      join(quoted, 'index.html'),
      '<html data-composition-variables="[{&quot;id&quot;:&quot;snapshot&quot;}]"></html>',
    );
    expect(await declaredVariables(quoted)).toEqual(['snapshot']);
    const none = await mkdtemp(join(tmpdir(), 'composition-'));
    await writeFile(join(none, 'index.html'), '<html></html>');
    expect(await declaredVariables(none)).toBeNull();
  });

  it('passes only the declared variables, and refuses one it can’t give', () => {
    const all = videoVariables(wrap, options);
    expect(pickDeclared(all, ['locale', 'url'])).toEqual({
      locale: 'es',
      url: 'https://wrapped.jjimenezm.dev/@ana-dev/2026',
    });
    expect(pickDeclared(all, null)).toBe(all);
    expect(() => pickDeclared(all, ['locale', 'mood'])).toThrow(/mood/);
  });
});
