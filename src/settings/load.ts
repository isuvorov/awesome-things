import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { toEnvironment, type UserConfig, userConfigSchema } from './schema.js';

/** `$AWESOME_THINGS_CONFIG`, then the XDG config dir — the same place `gh` or `starship` use. */
export function configPath(
  home: string = homedir(),
  env: Record<string, string | undefined> = process.env,
): string {
  if (env.AWESOME_THINGS_CONFIG) return env.AWESOME_THINGS_CONFIG;
  return join(env.XDG_CONFIG_HOME || join(home, '.config'), 'awesome-things', 'config.json');
}

export function parseUserConfig(text: string, path: string): UserConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${String(err)}`);
  }
  const result = userConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`${path} is invalid:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export interface AppliedConfig {
  path: string;
  /** The file was there and parsed. */
  loaded: boolean;
  /** Env names that took their value from the file — the daemon must not freeze them. */
  keys: string[];
  warnings: string[];
}

/**
 * Copies the file into `process.env`, never over a variable the environment already has:
 * flags > env > file > defaults. Everything downstream keeps reading `process.env`.
 */
export function applyUserConfig(
  env: Record<string, string | undefined> = process.env,
  path: string = configPath(homedir(), env),
): AppliedConfig {
  const applied: AppliedConfig = { path, loaded: false, keys: [], warnings: [] };
  if (!existsSync(path)) return applied;

  const config = parseUserConfig(readFileSync(path, 'utf-8'), path);
  applied.loaded = true;

  // Same rule as ssh: a file holding tokens must not be readable by anyone else.
  const mode = statSync(path).mode & 0o777;
  if (mode & 0o077) {
    applied.warnings.push(
      `${path} is readable by other users (mode ${mode.toString(8)}) and holds tokens — run "chmod 600 ${path}".`,
    );
  }

  for (const { names, value } of toEnvironment(config)) {
    if (names.some((name) => env[name])) continue;
    env[names[0]!] = value;
    applied.keys.push(names[0]!);
  }
  return applied;
}

let current: AppliedConfig | undefined;

/** Applied once per process, before anything reads `process.env`. */
export function loadUserConfig(): AppliedConfig {
  current ??= applyUserConfig();
  return current;
}
