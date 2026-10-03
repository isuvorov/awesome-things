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

/** tail dies on a missing file, and the daemon may simply not have logged yet. */
function ensureFiles(files: string[]) {
  const paths = daemonPaths();
  mkdirSync(paths.logDir, { recursive: true });
  for (const file of files) {
    if (!existsSync(file)) writeFileSync(file, '', 'utf-8');
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
    // "stop" would read as "stop the daemon" — Ctrl+C only ends the tail.
    if (options.follow) {
      console.log(`  ${dim('── following (Ctrl+C to detach, the daemon keeps running)')}`);
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
