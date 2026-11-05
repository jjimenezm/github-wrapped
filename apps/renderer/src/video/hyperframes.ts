import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

export interface RenderRequest {
  /** The HyperFrames project (a copy of the composition). */
  project: string;
  variablesFile: string;
  output: string;
  /** HyperFrames' low-memory profile (screenshot capture) instead of BeginFrame. */
  lowMemory: boolean;
  timeoutMs: number;
}

export type RenderVideo = (request: RenderRequest) => Promise<void>;

/** The render ran out of time; it was stopped (Chrome and FFmpeg included) and won't be retried. */
export class RenderTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`The video render took more than ${Math.round(timeoutMs / 1000)} s and was stopped.`);
    this.name = 'RenderTimeoutError';
  }
}

/** The settings measured on the server: 30 fps, `looks` quality, one Chrome. */
export function hyperframesArgs(request: RenderRequest): string[] {
  return [
    'render',
    request.project,
    '--output',
    request.output,
    '--fps',
    '30',
    '--quality',
    'looks',
    '--workers',
    '1',
    request.lowMemory ? '--low-memory-mode' : '--no-low-memory-mode',
    '--variables-file',
    request.variablesFile,
    '--strict-variables',
    '--json',
  ];
}

/** No telemetry or update checks, and no account-wide lock: the queue decides what runs. */
const HYPERFRAMES_ENV = {
  HYPERFRAMES_NO_TELEMETRY: '1',
  HYPERFRAMES_NO_UPDATE_CHECK: '1',
  HYPERFRAMES_RENDER_LOCK: 'off',
};

/** What a failed render printed last, for the job's failure reason. */
const OUTPUT_TAIL = 2_000;

type Spawn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

/**
 * Runs `hyperframes render` in its own process group, so a timeout stops the CLI together with
 * the Chrome and FFmpeg it started.
 */
export function createHyperframesRenderer(bin: string, spawnProcess: Spawn = spawn): RenderVideo {
  return (request) =>
    new Promise<void>((resolve, reject) => {
      const child = spawnProcess(bin, hyperframesArgs(request), {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...HYPERFRAMES_ENV },
      });
      let output = '';
      const keep = (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-OUTPUT_TAIL);
      };
      child.stdout?.on('data', keep);
      child.stderr?.on('data', keep);

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        killGroup(child);
      }, request.timeoutMs);

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        if (timedOut) reject(new RenderTimeoutError(request.timeoutMs));
        else if (code === 0) resolve();
        else {
          const reason = signal ?? `exit ${code}`;
          reject(new Error(`hyperframes render failed (${reason}): ${output.trim()}`));
        }
      });
    });
}

function killGroup(child: ChildProcess) {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}
