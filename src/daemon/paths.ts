import { homedir } from 'node:os';
import { join } from 'node:path';
import { appName } from '../config.js';

/** launchd identifies a job by this label forever — changing it orphans installed plists. */
export const daemonLabel = `com.isuvorov.${appName}`;

export interface DaemonPaths {
  label: string;
  plist: string;
  logDir: string;
  outLog: string;
  errLog: string;
}

/** Where ~/Library/Logs/awesome-things used to be — `install` points at it if it is still there. */
export function legacyLogDir(home: string = homedir()): string {
  return join(home, 'Library', 'Logs', appName);
}

/**
 * `~/.local/share/<app>/logs`, not `~/Library/Logs`: everything else in this setup keeps
 * its logs under XDG_DATA_HOME, and one predictable place beats a macOS-only convention
 * whose only consumer is Console.app. `AWESOME_THINGS_LOG_DIR` overrides it outright.
 */
export function logDir(
  home: string = homedir(),
  env: Record<string, string | undefined> = process.env,
): string {
  if (env.AWESOME_THINGS_LOG_DIR) return env.AWESOME_THINGS_LOG_DIR;
  return join(env.XDG_DATA_HOME || join(home, '.local', 'share'), appName, 'logs');
}

export function daemonPaths(
  home: string = homedir(),
  env: Record<string, string | undefined> = process.env,
): DaemonPaths {
  const dir = logDir(home, env);
  return {
    label: daemonLabel,
    plist: join(home, 'Library', 'LaunchAgents', `${daemonLabel}.plist`),
    logDir: dir,
    outLog: join(dir, 'server.log'),
    errLog: join(dir, 'server.error.log'),
  };
}

/** The GUI domain of the logged-in user — a LaunchAgent needs an Aqua session for AppleScript. */
export function serviceTarget(uid: number = process.getuid?.() ?? 0): string {
  return `gui/${uid}`;
}

export function serviceId(uid?: number): string {
  return `${serviceTarget(uid)}/${daemonLabel}`;
}
