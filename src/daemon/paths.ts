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

export function daemonPaths(home: string = homedir()): DaemonPaths {
  const logDir = join(home, 'Library', 'Logs', appName);
  return {
    label: daemonLabel,
    plist: join(home, 'Library', 'LaunchAgents', `${daemonLabel}.plist`),
    logDir,
    outLog: join(logDir, 'server.log'),
    errLog: join(logDir, 'server.error.log'),
  };
}

/** The GUI domain of the logged-in user — a LaunchAgent needs an Aqua session for AppleScript. */
export function serviceTarget(uid: number = process.getuid?.() ?? 0): string {
  return `gui/${uid}`;
}

export function serviceId(uid?: number): string {
  return `${serviceTarget(uid)}/${daemonLabel}`;
}
