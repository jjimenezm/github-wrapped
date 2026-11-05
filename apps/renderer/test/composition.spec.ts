/**
 * The wrap video composition: its variables contract (variables.schema.json against the
 * declarations in index.html), then the composition in HyperFrames' own headless Chrome. No MP4
 * (a render takes minutes): `hyperframes check` and stills at chosen instants, with a fixture's
 * variables injected the way a render injects them (window.__hfVariables, before any script).
 *
 *   pnpm --filter @wrapped/renderer test:composition
 */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import Ajv2020 from 'ajv/dist/2020';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { BASE_URL } from './fixtures';
import {
  avatarDataUri,
  EN_WRAP,
  ES_WRAP,
  videoVariables,
  type VideoVariables,
} from './video-fixtures';

const run = promisify(execFile);
const COMPOSITION = join(__dirname, '..', 'compositions', 'wrap');
const HYPERFRAMES = join(__dirname, '..', 'node_modules', '.bin', 'hyperframes');
const ENV = { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1', HYPERFRAMES_NO_UPDATE_CHECK: '1' };

const staged: string[] = [];

interface Declaration {
  id: string;
  type: 'string' | 'number' | 'color' | 'boolean' | 'enum';
  default: unknown;
  options?: { value: string }[];
}

/** The variables index.html declares (its data-composition-variables). */
function declarations(): Declaration[] {
  const html = readFileSync(join(COMPOSITION, 'index.html'), 'utf8');
  const json = /data-composition-variables='([^']*)'/.exec(html)?.[1];
  if (!json) throw new Error('index.html declares no variables');
  return JSON.parse(json) as Declaration[];
}

const schema = JSON.parse(readFileSync(join(COMPOSITION, 'variables.schema.json'), 'utf8')) as {
  $id: string;
  properties: Record<string, { type?: string; enum?: string[] }>;
};
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateVariables = ajv.compile(schema);
const validateSnapshot = ajv.getSchema(`${schema.$id}#/$defs/WrapSnapshot`)!;

/**
 * A copy of the composition (symlinks resolved) whose <head> first sets the render variables,
 * then adds the test-only `probe` markup.
 */
async function stage(vars: VideoVariables, probe = ''): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wrap-video-'));
  staged.push(dir);
  await cp(COMPOSITION, dir, {
    recursive: true,
    dereference: true,
    filter: (source) => !source.includes('.hyperframes'),
  });
  const index = join(dir, 'index.html');
  const variables = JSON.stringify(vars).replace(/</g, '\\u003c');
  const html = await readFile(index, 'utf8');
  await writeFile(
    index,
    html.replace('<head>', `<head><script>window.__hfVariables = ${variables};</script>${probe}`),
  );
  return dir;
}

/** Stills of the composition at exact instants, by time. */
async function stills(dir: string, times: number[]): Promise<Map<number, PNG>> {
  const out = join(dir, 'stills');
  await run(HYPERFRAMES, ['snapshot', dir, '--at', times.join(','), '--no-end', '-o', out], {
    env: ENV,
    timeout: 170_000,
  });
  const files = (await readdir(out)).filter((f) => /^frame-\d+-at-.+s\.png$/.test(f)).sort();
  const shots = new Map<number, PNG>();
  for (const file of files) {
    const at = Number(/-at-([\d.]+)s\.png$/.exec(file)?.[1]);
    shots.set(at, PNG.sync.read(await readFile(join(out, file))));
  }
  expect([...shots.keys()].sort((a, b) => a - b)).toEqual(times);
  return shots;
}

const pixel = (png: PNG, x: number, y: number) => {
  const i = (y * png.width + x) * 4;
  return [png.data[i] ?? 0, png.data[i + 1] ?? 0, png.data[i + 2] ?? 0];
};
const luminance = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Share of the frame between the progress bar and the footer that is bright (text, art, QR). */
function brightShare(png: PNG): number {
  let bright = 0;
  let total = 0;
  for (let y = 140; y < png.height - 200; y += 2) {
    for (let x = 0; x < png.width; x += 2) {
      total++;
      if (luminance(pixel(png, x, y)) > 170) bright++;
    }
  }
  return bright / total;
}

/** Vertical runs of a probe color down one column: [top, bottom) in pixels. */
function runs(png: PNG, x: number, match: (rgb: number[]) => boolean): [number, number][] {
  const found: [number, number][] = [];
  let start = -1;
  for (let y = 0; y <= png.height; y++) {
    const hit = y < png.height && match(pixel(png, x, y));
    if (hit && start < 0) start = y;
    if (!hit && start >= 0) {
      found.push([start, y]);
      start = -1;
    }
  }
  return found;
}
const isMagenta = ([r, g, b]: number[]) => r > 230 && g < 40 && b > 230;
const isCyan = ([r, g, b]: number[]) => r < 40 && g > 230 && b > 230;
const isGreen = ([r, g, b]: number[]) => r < 40 && g > 230 && b < 40;

afterAll(async () => {
  await Promise.all(staged.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('wrap video variables', () => {
  it('declares exactly the schema properties, with matching types', () => {
    const declared = declarations();
    const type = { string: 'string', number: 'integer' } as const;

    expect(declared.map((d) => d.id).sort()).toEqual(Object.keys(schema.properties).sort());
    for (const d of declared) {
      const property = schema.properties[d.id];
      if (d.type === 'enum') {
        expect(d.options?.map((o) => o.value)).toEqual(property.enum);
      } else {
        expect({ id: d.id, type: property.type }).toEqual({
          id: d.id,
          type: type[d.type as keyof typeof type],
        });
      }
    }
  });

  it('defaults to a demo the schema accepts, so the composition opens and checks on its own', () => {
    const defaults = Object.fromEntries(declarations().map((d) => [d.id, d.default]));

    expect(validateVariables(defaults) ? [] : validateVariables.errors).toEqual([]);
    expect(
      validateSnapshot(JSON.parse(defaults.snapshot as string)) ? [] : validateSnapshot.errors,
    ).toEqual([]);
  });

  it.each([
    ['es', ES_WRAP, null],
    ['en', EN_WRAP, avatarDataUri()],
  ] as const)('accepts the %s fixture', (locale, wrap, avatarHref) => {
    const vars = videoVariables(wrap, { locale, publicBaseUrl: BASE_URL, avatarHref });

    expect(validateVariables(vars) ? [] : validateVariables.errors).toEqual([]);
    expect(validateSnapshot(JSON.parse(vars.snapshot)) ? [] : validateSnapshot.errors).toEqual([]);
  });

  it('rejects a snapshot passed as an object (HyperFrames variables are never objects)', () => {
    const vars = { ...videoVariables(ES_WRAP, { locale: 'es', publicBaseUrl: BASE_URL }) };

    expect(validateVariables({ ...vars, snapshot: ES_WRAP })).toBe(false);
  });
});

describe('wrap video composition', () => {
  it('passes `hyperframes check` without errors', async () => {
    const { stdout } = await run(HYPERFRAMES, ['check', COMPOSITION, '--json'], {
      env: ENV,
      timeout: 170_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    const report = JSON.parse(stdout) as Record<string, { errorCount?: number }> & { ok: boolean };

    expect(report.ok).toBe(true);
    for (const pass of ['lint', 'runtime', 'layout', 'motion', 'contrast', 'craft']) {
      expect({ pass, errors: report[pass]?.errorCount }).toEqual({ pass, errors: 0 });
    }
  });

  it('draws every beat and ends on a QR that opens the wrap', async () => {
    const vars = videoVariables(ES_WRAP, { locale: 'es', publicBaseUrl: BASE_URL });
    const shots = await stills(await stage(vars), [2, 10, 20, 29]);

    for (const [at, png] of shots) {
      expect({ at, size: [png.width, png.height] }).toEqual({ at, size: [1080, 1920] });
      expect({ at, bright: brightShare(png) > 0.003 }).toEqual({ at, bright: true });
    }
    const last = shots.get(29)!;
    const qr = jsQR(new Uint8ClampedArray(last.data), last.width, last.height);
    expect(qr?.data).toBe('https://wrapped.jjimenezm.dev/@jpjimenez/2026');
  });

  it('speaks English and closes ranks when a metric failed', async () => {
    const wrap = {
      ...EN_WRAP,
      privateContributions: 0,
      metrics: { ...EN_WRAP.metrics, mergedPRs: null },
    };
    const vars = videoVariables(wrap, {
      locale: 'en',
      publicBaseUrl: BASE_URL,
      avatarHref: avatarDataUri(),
    });
    // Test-only probe: metric rows in flat magenta, the weekly panel in cyan, and the count label
    // in green when it reads "contributions" (magenta when it reads anything else).
    const probe = `
      <style>
        [data-metric], #metrics-weekly {
          background: #ff00ff !important;
          border-color: #ff00ff !important;
          backdrop-filter: none !important;
          box-shadow: none !important;
        }
        #metrics-weekly { background: #00ffff !important; border-color: #00ffff !important; }
        [data-metric] *, #metrics-weekly * { visibility: hidden !important; }
        html[data-probe-label] #count-label { color: transparent !important; }
        html[data-probe-label='contributions'] #count-label { background: #00ff00 !important; }
        html[data-probe-label]:not([data-probe-label='contributions']) #count-label {
          background: #ff00ff !important;
        }
      </style>
      <script>
        new MutationObserver(function () {
          var label = document.getElementById('count-label');
          if (label) document.documentElement.setAttribute('data-probe-label', label.textContent);
        }).observe(document, { subtree: true, childList: true, characterData: true });
      </script>`;
    const shots = await stills(await stage(vars, probe), [6, 10]);

    // The count, 2.5 s in: its label reads "contributions".
    const count = shots.get(6)!;
    expect(runs(count, 540, isGreen).length).toBe(1);
    expect(runs(count, 540, isMagenta)).toEqual([]);

    // The metrics, 2.5 s in: commits, reviews and issues, evenly spaced, and the weekly panel
    // right after them; no empty slot where merged PRs would have been.
    const metrics = shots.get(10)!;
    const rows = runs(metrics, 540, isMagenta);
    const [chart] = runs(metrics, 540, isCyan);
    expect(rows).toHaveLength(3);
    expect(chart).toBeDefined();
    const heights = rows.map(([top, bottom]) => bottom - top);
    const gaps = rows.slice(1).map(([top], i) => top - rows[i][1]);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(2);
    expect(chart[0] - rows[rows.length - 1][1]).toBeLessThan(heights[0]);
  });
});
