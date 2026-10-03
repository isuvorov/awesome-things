import { spawn } from 'node:child_process';
import { serviceId, serviceTarget } from './paths.js';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Never rejects: a missing binary comes back as `code: -1` so callers stay branch-free. */
export function run(cmd: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err: Error) => resolve({ code: -1, stdout, stderr: err.message }));
    child.on('close', (code: number | null) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

export interface ServiceState {
  loaded: boolean;
  running: boolean;
  pid?: number;
  lastExitCode?: number;
}

/**
 * `launchctl print` is the only source of truth for a job's state. Exit code 113
 * ("Could not find service") is the normal answer for a job that is not loaded.
 */
export function parseLaunchctlPrint(result: RunResult): ServiceState {
  if (result.code !== 0) return { loaded: false, running: false };

  const state: ServiceState = { loaded: true, running: false };
  const stateMatch = result.stdout.match(/^\s*state\s*=\s*(\S+)/m);
  state.running = stateMatch?.[1] === 'running';

  const pidMatch = result.stdout.match(/^\s*pid\s*=\s*(\d+)/m);
  if (pidMatch) state.pid = Number(pidMatch[1]);

  const exitMatch = result.stdout.match(/^\s*last exit code\s*=\s*(-?\d+)/m);
  if (exitMatch) state.lastExitCode = Number(exitMatch[1]);

  return state;
}

export async function printService(): Promise<ServiceState> {
  return parseLaunchctlPrint(await run('launchctl', ['print', serviceId()]));
}

/** A bootstrap of an already-loaded job is a no-op, not a failure — report it as such. */
export function isAlreadyLoaded(result: RunResult): boolean {
  return /already|service already loaded|Input\/output error/i.test(result.stderr);
}

export function isNotLoaded(result: RunResult): boolean {
  return /No such process|Could not find service/i.test(result.stderr);
}

export async function bootstrapService(plist: string): Promise<RunResult> {
  const result = await run('launchctl', ['bootstrap', serviceTarget(), plist]);
  if (result.code === 0 || isAlreadyLoaded(result)) return { ...result, code: 0 };
  // Pre-Sierra syntax, still accepted and occasionally the only one that works.
  const fallback = await run('launchctl', ['load', '-w', plist]);
  return fallback.code === 0 ? fallback : result;
}

export async function bootoutService(): Promise<RunResult> {
  const result = await run('launchctl', ['bootout', serviceId()]);
  if (result.code === 0 || isNotLoaded(result)) return { ...result, code: 0 };
  return result;
}

/** `-k` kills the running instance first — the only reliable "pick up new code" restart. */
export async function kickstartService(): Promise<RunResult> {
  return run('launchctl', ['kickstart', '-k', serviceId()]);
}

/** Reads a plist back as JSON. `plutil` ships with every macOS. */
export async function readPlistJson(path: string): Promise<Record<string, any> | null> {
  const result = await run('plutil', ['-convert', 'json', '-o', '-', path]);
  if (result.code !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}
