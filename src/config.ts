import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A `bun build --compile` binary has no package.json next to it — the file lives at a
 * virtual `/$bunfs/` path that does not exist. Failing to read it must never be fatal,
 * or the whole CLI dies at import time.
 */
function readPackageJson(): { version?: string; description?: string } {
  try {
    return JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf-8'));
  } catch {
    return {};
  }
}

const packageJson = readPackageJson();

export const appVersion: string = packageJson.version ?? '0.0.0';
export const appDescription: string = packageJson.description ?? '';
export const appName = 'awesome-things';
export const mcpName = 'things3';
export const defaultPort =
  Number(process.env.AWESOME_THINGS_PORT) || Number(process.env.PORT) || 32123;
