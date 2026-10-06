import { loadUserConfig } from './load.js';

/**
 * Side-effect import, first line of every entry point: `config.ts` computes `defaultPort` from
 * `process.env` at import time, so the file has to be in the environment before that.
 */
try {
  for (const warning of loadUserConfig().warnings) console.error(`⚠  ${warning}`);
} catch (err) {
  // A broken config must not start a server with the wrong token — stop and say why.
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
