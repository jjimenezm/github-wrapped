import { spawn, type SpawnOptions } from 'node:child_process';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createHyperframesRenderer,
  hyperframesArgs,
  RenderTimeoutError,
  type RenderRequest,
} from './hyperframes';

/** Stands in for the CLI: writes the MP4, fails, or hangs with a child process of its own. */
const FAKE_CLI = `#!/bin/sh
out=""
while [ $# -gt 0 ]; do
  case "$1" in --output) out="$2"; shift ;; esac
  shift
done
case "$FAKE_HF" in
  ok) printf 'mp4' > "$out"; exit 0 ;;
  fail) echo '{"ok":false,"error":"Composition failed to load"}'; exit 3 ;;
  hang) sleep 30 & echo $! > "$FAKE_HF_CHILD"; wait ;;
esac
`;

async function setup(mode: 'ok' | 'fail' | 'hang') {
  const dir = await mkdtemp(join(tmpdir(), 'hyperframes-'));
  const bin = join(dir, 'hyperframes');
  await writeFile(bin, FAKE_CLI);
  await chmod(bin, 0o755);
  const childFile = join(dir, 'child.pid');
  const render = createHyperframesRenderer(bin, (command, args, options: SpawnOptions) =>
    spawn(command, args, {
      ...options,
      env: { ...options.env, FAKE_HF: mode, FAKE_HF_CHILD: childFile },
    }),
  );
  const request: RenderRequest = {
    project: join(dir, 'composition'),
    variablesFile: join(dir, 'variables.json'),
    output: join(dir, 'video.mp4'),
    lowMemory: false,
    timeoutMs: 10_000,
  };
  return { render, request, childFile };
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('HyperFrames renderer', () => {
  it('renders with the settings measured on the server', () => {
    const args = hyperframesArgs({
      project: '/w/composition',
      variablesFile: '/w/variables.json',
      output: '/w/video.mp4',
      lowMemory: false,
      timeoutMs: 1,
    });
    expect(args.slice(0, 2)).toEqual(['render', '/w/composition']);
    expect(args.join(' ')).toContain(
      '--output /w/video.mp4 --fps 30 --quality looks --workers 1 --no-low-memory-mode',
    );
    expect(args.join(' ')).toContain('--variables-file /w/variables.json --strict-variables');
  });

  it('switches to the low-memory profile when asked', () => {
    const args = hyperframesArgs({
      project: 'p',
      variablesFile: 'v',
      output: 'o',
      lowMemory: true,
      timeoutMs: 1,
    });
    expect(args).toContain('--low-memory-mode');
    expect(args).not.toContain('--no-low-memory-mode');
  });

  it('resolves once the CLI wrote the MP4', async () => {
    const t = await setup('ok');
    await t.render(t.request);
    expect(await readFile(t.request.output, 'utf8')).toBe('mp4');
  });

  it('fails with what the CLI printed last', async () => {
    const t = await setup('fail');
    await expect(t.render(t.request)).rejects.toThrow(/exit 3.*Composition failed to load/);
  });

  it('stops a render that runs out of time, with every process it started', async () => {
    const t = await setup('hang');
    // Long enough for the fake CLI to start its child: macOS checks a new script before it runs.
    await expect(t.render({ ...t.request, timeoutMs: 3_000 })).rejects.toBeInstanceOf(
      RenderTimeoutError,
    );
    const child = Number(await readFile(t.childFile, 'utf8'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(alive(child)).toBe(false);
  });

  it('fails when the CLI is not installed', async () => {
    const render = createHyperframesRenderer('/nonexistent/hyperframes');
    await expect(
      render({ project: 'p', variablesFile: 'v', output: 'o', lowMemory: false, timeoutMs: 1000 }),
    ).rejects.toThrow(/ENOENT/);
  });
});
