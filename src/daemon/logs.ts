import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { cyan, dim, isInteractive } from '../server/logger.js';
import { daemonPaths } from './paths.js';

export type LogStream = 'out' | 'err' | 'all';

export interface LogsOptions {
  follow?: boolean;
  lines?: number;
  stream?: LogStream;
  clear?: boolean;
}

/**
 * `-f` is the global alias for `--format`, so yargs hands its default `'pretty'` to
 * `follow` as well. Anything but an explicit boolean must mean "do not follow", or a
 * plain `daemon logs` never returns.
 */
export function wantsFollow(value: unknown): boolean {
  return value === true;
}

export function logFiles(stream: LogStream = 'all'): string[] {
  const paths = daemonPaths();
  if (stream === 'out') return [paths.outLog];
  if (stream === 'err') return [paths.errLog];
  return [paths.outLog, paths.errLog];
}

/** `-F` (not `-f`) so the stream survives a log rotation or a fresh daemon install. */
export function buildTailArgs(options: LogsOptions, files: string[]): string[] {
  const args = ['-n', String(options.lines ?? 50)];
  if (options.follow) args.push('-F');
  return [...args, ...files];
}

/**
 * tail dies on a missing file, and the daemon may simply not have logged yet. Creating
 * them is best-effort on purpose: reading existing logs must not fail because the
 * directory could not be (re)created — `mkdir` reports EEXIST under a sandbox that
 * denies the call, and that is no reason to refuse to show the logs.
 */
function ensureFiles(files: string[]) {
  const paths = daemonPaths();
  try {
    mkdirSync(paths.logDir, { recursive: true });
  } catch {}
  for (const file of files) {
    if (existsSync(file)) continue;
    try {
      writeFileSync(file, '', 'utf-8');
    } catch {}
  }
}

export async function runLogs(options: LogsOptions = {}): Promise<number> {
  const files = logFiles(options.stream);
  ensureFiles(files);

  if (options.clear) {
    for (const file of files) writeFileSync(file, '', 'utf-8');
    console.log(`  ${cyan('✓')} Cleared ${files.length === 1 ? files[0] : 'daemon logs'}`);
    return 0;
  }

  if (isInteractive) {
    for (const file of files) console.log(`  ${dim(`── ${file}`)}`);
    // Say plainly that this terminal is a reader, not the server: "stop" would read as
    // "stop the daemon", and a second window showing live logs looks like a second server.
    if (options.follow) {
      console.log(`  ${dim('── reader only: this window tails the log files, it is not the')}`);
      console.log(`  ${dim('   server process. Ctrl+C detaches, the daemon keeps running.')}`);
    }
    console.log();
  }

  const args = buildTailArgs(options, files);
  return new Promise((resolve) => {
    const child = spawn('tail', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', (err: Error) => {
      console.error(`Error: could not run tail: ${err.message}`);
      resolve(1);
    });
    child.on('close', (code: number | null) => resolve(code ?? 0));
  });
}
