import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJsonPath = resolve(import.meta.dirname, '../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

export const appVersion: string = packageJson.version;
export const appName = 'awesome-things';
export const mcpName = 'things3';
export const defaultPort =
  Number(process.env.AWESOME_THINGS_PORT) || Number(process.env.PORT) || 32123;
