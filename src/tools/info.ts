import { existsSync, realpathSync } from 'node:fs';
import { appDescription, appName, appVersion, defaultPort } from '../config.js';
import { bold, cyan, dim, isInteractive, stripAnsi } from '../server/logger.js';

export interface AppInfo {
  name: string;
  version: string;
  description: string;
  cwd: string;
  bin: string;
  source: string;
  platform: string;
  runtime: string;
  node: string;
  port: number;
  things3: string;
}

export interface SourceInput {
  /** Path the process was started from (`process.argv[1]`). */
  bin: string;
  /** Same path with symlinks resolved. */
  realBin: string;
  cwd: string;
}

/** Where this binary actually comes from — the question you ask when a fix "did not apply". */
export function detectSource({ bin, realBin, cwd }: SourceInput): string {
  if (!bin) return 'unknown';
  if (/\.(ts|tsx)$/.test(realBin)) return 'source (running from src/)';
  if (realBin.includes('/_npx/') || realBin.includes('/.npm/_npx/'))
    return 'npx (temporary install)';
  if (realBin.includes('/node_modules/')) {
    return realBin.startsWith(`${cwd}/`) ? 'local node_modules' : 'global install';
  }
  // Outside node_modules: either a symlinked `npm link`, or a build run from its own checkout.
  if (bin === realBin && realBin.startsWith(`${cwd}/`)) return 'source (local checkout)';
  return 'linked (npm link / dev)';
}

function safeRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function detectRuntime(): string {
  const bunVersion = (globalThis as { Bun?: { version?: string } }).Bun?.version;
  if (bunVersion) return `bun v${bunVersion}`;
  return `node ${process.version}`;
}

function detectThings3(): string {
  for (const path of ['/Applications/Things3.app', '/System/Applications/Things3.app']) {
    try {
      if (existsSync(path)) return `installed (${path})`;
    } catch {}
  }
  return process.platform === 'darwin' ? 'not found in /Applications' : 'unavailable (macOS only)';
}

export function collectInfo(): AppInfo {
  const bin = process.argv[1] || process.execPath;
  const realBin = safeRealpath(bin);
  const cwd = process.cwd();

  return {
    name: appName,
    version: appVersion,
    description: appDescription,
    cwd,
    bin: realBin,
    source: detectSource({ bin, realBin, cwd }),
    platform: `${process.platform} ${process.arch}`,
    runtime: detectRuntime(),
    node: process.version,
    port: defaultPort,
    things3: detectThings3(),
  };
}

const FIELD_LABELS: Array<[keyof AppInfo, string]> = [
  ['name', 'Name'],
  ['version', 'Version'],
  ['description', 'Description'],
  ['cwd', 'CWD'],
  ['bin', 'Bin'],
  ['source', 'Source'],
  ['platform', 'Platform'],
  ['runtime', 'Runtime'],
  ['node', 'Node'],
  ['port', 'Port'],
  ['things3', 'Things3'],
];

/** ` ℹ awesome-things [Version]      0.0.6` — one aligned line per field. */
export function formatInfo(info: AppInfo): string {
  const width = Math.max(...FIELD_LABELS.map(([, label]) => label.length + 2)) + 4;

  const lines = FIELD_LABELS.map(([field, label]) => {
    const key = `[${label}]`.padEnd(width);
    return ` ${cyan('ℹ')} ${dim(info.name)} ${key}${bold(String(info[field]))}`;
  });

  const text = lines.join('\n');
  return isInteractive ? text : stripAnsi(text);
}
