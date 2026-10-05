import { existsSync } from 'node:fs';
import { logFiles, runLogs } from '../daemon/logs.js';
import { dim, printStartupBanner, yellow } from './logger.js';

export interface InstanceInfo {
  pid?: number;
  /** The running server writes to a terminal, so there is no file to read. */
  tty?: boolean;
  logs?: string[];
}

/**
 * Ask the instance that owns the port who it is. `/health` answers pid and log paths only
 * to a caller holding the token, which a second `server` run always has.
 */
export async function fetchInstanceInfo(
  port: number,
  token: string | undefined,
): Promise<InstanceInfo> {
  try {
    const res = await fetch(`http://localhost:${port}/health`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as InstanceInfo;
    return { pid: data.pid, tty: data.tty, logs: data.logs };
  } catch {
    // An older build, a wrong token, or a server too busy to answer — attach blindly.
    return {};
  }
}

/**
 * Which file to tail. The running instance reports its own paths, which beat this
 * process's guess whenever the two disagree about AWESOME_THINGS_LOG_DIR.
 */
export function resolveLogFiles(info: InstanceInfo): string[] {
  const candidates = info.logs?.length ? info.logs : logFiles();
  return candidates.filter((file) => existsSync(file));
}

/**
 * A second `server` cannot take a port its own twin already holds. Instead of refusing,
 * it prints the same banner and becomes a reader of that instance's log file — same
 * window, same information, minus the serving.
 */
export async function attachToRunning(port: number, token: string | undefined): Promise<void> {
  const info = await fetchInstanceInfo(port, token);
  const files = resolveLogFiles(info);

  printStartupBanner({
    port,
    startPort: port,
    token,
    reader: { pid: info.pid, logFile: files[0] },
  });

  if (!files.length) {
    const where = info.tty ? 'its own terminal' : 'a place this process cannot read';
    console.log(`  ${yellow('⚠')}  No log file to follow — the server writes to ${where}.`);
    console.log(`     ${dim('Run it as a daemon to get log files: awesome-things daemon')}`);
    console.log();
    return;
  }

  // Only a human at a terminal wants an endless tail; piped output must still end.
  if (!process.stdout.isTTY) return;
  await runLogs({ follow: true, lines: 20, files, quiet: true });
}
