import { dirname } from 'node:path';

/**
 * launchd hands a job an almost empty environment: no PATH, no shell profile, none
 * of the vars the user exported. Everything the server needs has to be baked in.
 */
export const FORWARDED_ENV_KEYS = [
  'AWESOME_THINGS_TOKEN',
  'AWESOME_THINGS_URL_TOKEN',
  'AWESOME_THINGS_PORT',
  'AWESOME_THINGS_TUNNEL',
  'AWESOME_THINGS_DOMAIN',
  'NGROK_AUTHTOKEN',
  'NO_COLOR',
] as const;

/** frp is configured through a whole family of vars — forward them wholesale. */
export const FORWARDED_ENV_PREFIXES = ['AWESOME_THINGS_FRP_', 'FRP_'] as const;

const SYSTEM_PATH = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
];

/** `frpc` and `osascript` are looked up in PATH, so the runtime's own bin dir comes first. */
export function buildPath(execPath: string, currentPath = ''): string {
  const parts = [dirname(execPath), ...currentPath.split(':'), ...SYSTEM_PATH];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    if (!part || seen.has(part)) continue;
    seen.add(part);
    result.push(part);
  }
  return result.join(':');
}

export interface EnvironmentInput {
  execPath: string;
  home: string;
  env?: Record<string, string | undefined>;
  port?: number;
  /** Bearer token to pin. Without it the server mints a random one on every restart. */
  token?: string;
  /** Explicitly run without auth — also drops an inherited AWESOME_THINGS_TOKEN. */
  noToken?: boolean;
  tunnel?: string;
  domain?: string;
  /** Keep ANSI in the log files — they are read back through `tail` in a terminal. */
  color?: boolean;
}

export function collectEnvironment(input: EnvironmentInput): Record<string, string> {
  const { execPath, home, env = process.env, port, token, noToken, tunnel, domain, color } = input;
  const result: Record<string, string> = {};

  for (const key of FORWARDED_ENV_KEYS) {
    const value = env[key];
    if (value) result[key] = value;
  }
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    if (FORWARDED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) result[key] = value;
  }

  if (port) result.AWESOME_THINGS_PORT = String(port);
  if (token) result.AWESOME_THINGS_TOKEN = token;
  if (noToken) delete result.AWESOME_THINGS_TOKEN;
  if (tunnel) result.AWESOME_THINGS_TUNNEL = tunnel;
  if (domain) result.AWESOME_THINGS_DOMAIN = domain;

  // launchd gives the job no TTY, so the logger would strip every colour without this.
  if (color) {
    result.FORCE_COLOR = '1';
    delete result.NO_COLOR;
  } else if (color === false) {
    delete result.FORCE_COLOR;
  }

  result.HOME = home;
  result.PATH = buildPath(execPath, env.PATH ?? '');
  return result;
}

export interface ProgramInput {
  /** `process.execPath` — the bun or node binary that is running the CLI. */
  execPath: string;
  /** The CLI entry point with symlinks resolved. */
  bin: string;
  noToken?: boolean;
}

/**
 * Always `<runtime> <script> server`: the bin may be a symlink from `npm link` or lose
 * its exec bit, and launchd would then fail with a bare "Operation not permitted".
 */
export function resolveProgramArguments({ execPath, bin, noToken }: ProgramInput): string[] {
  const args = [execPath, bin, 'server'];
  if (noToken) args.push('--no-token');
  return args;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface PlistInput {
  label: string;
  programArguments: string[];
  environment: Record<string, string>;
  workingDirectory: string;
  outLog: string;
  errLog: string;
}

export function buildPlist(input: PlistInput): string {
  const { label, programArguments, environment, workingDirectory, outLog, errLog } = input;
  const args = programArguments.map((arg) => `    <string>${escapeXml(arg)}</string>`).join('\n');
  const env = Object.entries(environment)
    .map(
      ([key, value]) =>
        `    <key>${escapeXml(key)}</key>\n    <string>${escapeXml(value)}</string>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(label)}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(workingDirectory)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${env}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${escapeXml(outLog)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(errLog)}</string>
</dict>
</plist>
`;
}
