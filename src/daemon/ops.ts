import {
  chmodSync,
  existsSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { defaultPort } from '../config.js';
import { APP_ID, probePort } from '../server/port.js';
import { detectSource } from '../tools/info.js';
import { generateToken } from '../utils/auth.js';
import {
  bootoutService,
  bootstrapService,
  kickstartService,
  printService,
  readPlistJson,
  type ServiceState,
} from './launchctl.js';
import { daemonPaths } from './paths.js';
import { buildPlist, collectEnvironment, resolveProgramArguments } from './plist.js';

/** launchd never rotates anything; a chatty server would otherwise fill the disk. */
const LOG_ROTATE_LIMIT = 10 * 1024 * 1024;
const HEALTH_TIMEOUT_MS = 10_000;
const HEALTH_INTERVAL_MS = 250;

export type DaemonActionName =
  | 'install'
  | 'uninstall'
  | 'start'
  | 'stop'
  | 'restart'
  | 'status'
  | 'up';

export interface DaemonLogInfo {
  out: string;
  err: string;
  outSize: number;
  errSize: number;
}

export interface DaemonResult {
  action: DaemonActionName;
  ok: boolean;
  label: string;
  plist: string;
  installed: boolean;
  loaded: boolean;
  running: boolean;
  /** The server actually answered `/health` and identified itself as this app. */
  healthy: boolean;
  pid?: number;
  lastExitCode?: number;
  port: number;
  url: string;
  token?: string;
  program?: string[];
  logs: DaemonLogInfo;
  warnings: string[];
  hints: string[];
}

export interface InstallOptions {
  port?: number;
  token?: string;
  noToken?: boolean;
  tunnel?: string;
  domain?: string;
  /** Install the plist but leave the job stopped. */
  start?: boolean;
}

/** Any of these means the plist has to be rewritten — `start` would silently ignore them. */
export function hasConfigOverrides(options: InstallOptions): boolean {
  return (
    options.port !== undefined ||
    options.token !== undefined ||
    options.noToken === true ||
    options.tunnel !== undefined ||
    options.domain !== undefined
  );
}

export interface UninstallOptions {
  /** Also delete the log files. Off by default — logs outlive the daemon on purpose. */
  purge?: boolean;
}

export function assertDarwin() {
  if (process.platform !== 'darwin') {
    throw new Error(
      `The daemon uses launchd and only works on macOS (current: ${process.platform})`,
    );
  }
}

function safeRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function fileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function rotateIfLarge(path: string) {
  if (fileSize(path) < LOG_ROTATE_LIMIT) return;
  try {
    renameSync(path, `${path}.1`);
  } catch {}
}

async function waitForHealth(port: number, timeoutMs = HEALTH_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await probePort(port)) === 'ours') return true;
    await new Promise((resolve) => setTimeout(resolve, HEALTH_INTERVAL_MS));
  }
  return false;
}

interface InstalledPlist {
  port?: number;
  token?: string;
  program?: string[];
}

async function readInstalledPlist(plistPath: string): Promise<InstalledPlist> {
  if (!existsSync(plistPath)) return {};
  const data = await readPlistJson(plistPath);
  if (!data) return {};
  const env = (data.EnvironmentVariables ?? {}) as Record<string, string>;
  return {
    port: env.AWESOME_THINGS_PORT ? Number(env.AWESOME_THINGS_PORT) : undefined,
    token: env.AWESOME_THINGS_TOKEN,
    program: Array.isArray(data.ProgramArguments) ? data.ProgramArguments : undefined,
  };
}

function logInfo(): DaemonLogInfo {
  const paths = daemonPaths();
  return {
    out: paths.outLog,
    err: paths.errLog,
    outSize: fileSize(paths.outLog),
    errSize: fileSize(paths.errLog),
  };
}

async function buildResult(
  action: DaemonActionName,
  extras: {
    state?: ServiceState;
    port?: number;
    token?: string;
    healthy?: boolean;
    ok?: boolean;
    warnings?: string[];
    hints?: string[];
  } = {},
): Promise<DaemonResult> {
  const paths = daemonPaths();
  const installed = existsSync(paths.plist);
  const stored = await readInstalledPlist(paths.plist);
  const state = extras.state ?? (await printService());
  const port = extras.port ?? stored.port ?? defaultPort;
  const healthy = extras.healthy ?? (await probePort(port)) === 'ours';

  return {
    action,
    ok: extras.ok ?? true,
    label: paths.label,
    plist: paths.plist,
    installed,
    loaded: state.loaded,
    running: state.running,
    healthy,
    pid: state.pid,
    lastExitCode: state.lastExitCode,
    port,
    url: `http://localhost:${port}`,
    token: extras.token ?? stored.token,
    program: stored.program,
    logs: logInfo(),
    warnings: extras.warnings ?? [],
    hints: extras.hints ?? [],
  };
}

export async function installDaemon(options: InstallOptions = {}): Promise<DaemonResult> {
  assertDarwin();
  const paths = daemonPaths();
  const warnings: string[] = [];
  const hints: string[] = [];

  const bin = process.argv[1] || '';
  const realBin = safeRealpath(bin);
  if (!realBin) throw new Error('Cannot determine which CLI file to daemonize');

  const source = detectSource({ bin, realBin, cwd: process.cwd() });
  if (source.startsWith('npx')) {
    warnings.push(
      `Installed from an npx cache (${realBin}) — that path is temporary. Run "npm i -g ${APP_ID}" and install the daemon again.`,
    );
  }

  const port = options.port ?? defaultPort;
  const stored = await readInstalledPlist(paths.plist);
  const token = options.noToken
    ? undefined
    : options.token || process.env.AWESOME_THINGS_TOKEN || stored.token || generateToken();

  mkdirSync(paths.logDir, { recursive: true });
  mkdirSync(dirname(paths.plist), { recursive: true });
  rotateIfLarge(paths.outLog);
  rotateIfLarge(paths.errLog);

  const programArguments = resolveProgramArguments({
    execPath: process.execPath,
    bin: realBin,
    noToken: options.noToken,
  });

  const plist = buildPlist({
    label: paths.label,
    programArguments,
    environment: collectEnvironment({
      execPath: process.execPath,
      home: homedir(),
      port,
      token,
      noToken: options.noToken,
      tunnel: options.tunnel,
      domain: options.domain,
    }),
    workingDirectory: homedir(),
    outLog: paths.outLog,
    errLog: paths.errLog,
  });

  writeFileSync(paths.plist, plist, 'utf-8');
  // The plist carries the bearer token — keep it out of reach of other users.
  chmodSync(paths.plist, 0o600);

  const probe = await probePort(port);
  if (probe === 'ours') {
    warnings.push(
      `Port ${port} is already served by ${APP_ID} — a manually started server is running. The plist is installed but the daemon was not started; stop that process and run "${APP_ID} daemon start".`,
    );
    return buildResult('install', { port, token, healthy: true, warnings, hints });
  }
  if (probe === 'other') {
    warnings.push(
      `Port ${port} is taken by another app — the server will fall back to ${port + 1} and the URL above will be wrong.`,
    );
  }

  if (options.start === false) {
    hints.push(`${APP_ID} daemon start`);
    return buildResult('install', { port, token, healthy: false, warnings, hints });
  }

  await bootoutService();
  const bootstrap = await bootstrapService(paths.plist);
  if (bootstrap.code !== 0) {
    return buildResult('install', {
      port,
      token,
      healthy: false,
      ok: false,
      warnings: [...warnings, `launchctl bootstrap failed: ${bootstrap.stderr.trim()}`],
      hints,
    });
  }

  const healthy = await waitForHealth(port);
  if (!healthy) {
    warnings.push(
      `The daemon did not answer /health within ${HEALTH_TIMEOUT_MS / 1000}s. macOS may be waiting for you to grant Automation access to Things3 — check the logs.`,
    );
  }
  return buildResult('install', { port, token, healthy, warnings, hints });
}

export async function uninstallDaemon(options: UninstallOptions = {}): Promise<DaemonResult> {
  assertDarwin();
  const paths = daemonPaths();
  const warnings: string[] = [];

  const bootout = await bootoutService();
  if (bootout.code !== 0) warnings.push(`launchctl bootout failed: ${bootout.stderr.trim()}`);

  const stored = await readInstalledPlist(paths.plist);
  try {
    rmSync(paths.plist, { force: true });
  } catch (err) {
    warnings.push(`Could not delete ${paths.plist}: ${String(err)}`);
  }

  if (options.purge) {
    for (const log of [paths.outLog, paths.errLog, `${paths.outLog}.1`, `${paths.errLog}.1`]) {
      try {
        rmSync(log, { force: true });
      } catch {}
    }
  }

  return buildResult('uninstall', {
    port: stored.port,
    healthy: false,
    warnings,
    hints: options.purge ? [] : [`Logs kept in ${paths.logDir}`],
  });
}

export async function startDaemon(): Promise<DaemonResult> {
  assertDarwin();
  const paths = daemonPaths();
  if (!existsSync(paths.plist)) {
    throw new Error(`Daemon is not installed — run "${APP_ID} daemon install" first`);
  }

  const result = await bootstrapService(paths.plist);
  if (result.code !== 0) {
    return buildResult('start', {
      ok: false,
      healthy: false,
      warnings: [`launchctl bootstrap failed: ${result.stderr.trim()}`],
    });
  }

  const stored = await readInstalledPlist(paths.plist);
  const port = stored.port ?? defaultPort;
  const healthy = await waitForHealth(port);
  return buildResult('start', { port, healthy });
}

export async function stopDaemon(): Promise<DaemonResult> {
  assertDarwin();
  const result = await bootoutService();
  const warnings = result.code === 0 ? [] : [`launchctl bootout failed: ${result.stderr.trim()}`];
  return buildResult('stop', { ok: result.code === 0, healthy: false, warnings });
}

export async function restartDaemon(): Promise<DaemonResult> {
  assertDarwin();
  const paths = daemonPaths();
  if (!existsSync(paths.plist)) {
    throw new Error(`Daemon is not installed — run "${APP_ID} daemon install" first`);
  }

  rotateIfLarge(paths.outLog);
  rotateIfLarge(paths.errLog);

  const state = await printService();
  const result = state.loaded ? await kickstartService() : await bootstrapService(paths.plist);
  if (result.code !== 0) {
    return buildResult('restart', {
      ok: false,
      healthy: false,
      warnings: [`launchctl restart failed: ${result.stderr.trim()}`],
    });
  }

  const stored = await readInstalledPlist(paths.plist);
  const port = stored.port ?? defaultPort;
  const healthy = await waitForHealth(port);
  return buildResult('restart', { port, healthy });
}

export async function daemonStatus(): Promise<DaemonResult> {
  assertDarwin();
  const result = await buildResult('status');
  if (result.installed && !result.healthy) {
    result.hints.push(`Not answering? ${APP_ID} daemon logs --err`);
  }
  return result;
}

export type UpPlan = 'install' | 'start' | 'restart' | 'nothing';

export interface UpStateInput {
  installed: boolean;
  running: boolean;
  healthy: boolean;
  /** A --port/--token/--tunnel/--domain flag was passed, so the plist must be rewritten. */
  overrides?: boolean;
}

/**
 * What the bare `daemon` command has to do, given the state it found.
 *
 * `healthy` wins over everything: something already serves the port, and restarting it
 * would hand the tunnel domain to a new process for no reason. `running && !healthy` has
 * to be a restart rather than a start — launchd already holds the job, so `bootstrap`
 * would return "already loaded" and change nothing.
 */
export function planUp({ installed, running, healthy, overrides }: UpStateInput): UpPlan {
  if (!installed || overrides) return 'install';
  if (healthy) return 'nothing';
  return running ? 'restart' : 'start';
}

/**
 * `awesome-things daemon` with no subcommand: install it on the first run, start it when
 * it is installed but down, and leave an already-answering server completely alone.
 */
export async function upDaemon(options: InstallOptions = {}): Promise<DaemonResult> {
  assertDarwin();
  const paths = daemonPaths();
  const stored = await readInstalledPlist(paths.plist);
  const port = options.port ?? stored.port ?? defaultPort;
  const state = await printService();

  const plan = planUp({
    installed: existsSync(paths.plist),
    running: state.running,
    healthy: (await probePort(port)) === 'ours',
    overrides: hasConfigOverrides(options),
  });

  if (plan === 'install') return { ...(await installDaemon(options)), action: 'up' };
  if (plan === 'start') return { ...(await startDaemon()), action: 'up' };
  if (plan === 'restart') return { ...(await restartDaemon()), action: 'up' };

  // Answering but outside launchd means a hand-started server — it will not survive a reboot.
  const warnings = state.running
    ? []
    : [
        `Port ${port} answers, but launchd does not manage that process — it was started by hand and will not come back after a reboot. Stop it and run "${APP_ID} daemon start".`,
      ];
  return buildResult('up', {
    state,
    port,
    healthy: true,
    warnings,
    hints: ['Already up — nothing to do.'],
  });
}
