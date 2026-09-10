import { isClientAbort } from './errors.js';
import { logError, yellow } from './logger.js';

let installed = false;

/**
 * A long-running server must survive stray errors: an SSE stream aborted by the
 * client, a rejected promise deep inside a dependency, a broken pipe.
 *
 * Without these handlers Bun kills the process and prints just "error: undefined".
 * Must be called from `startServer()` — not from an `import.meta.main` block —
 * because the CLI imports the server as a module (`import.meta.main` is false there).
 */
export function installProcessGuards() {
  if (installed) return;
  installed = true;

  process.on('unhandledRejection', (reason) => {
    if (isClientAbort(reason)) {
      logError(yellow('Client disconnected mid-response (ignored)'), reason);
      return;
    }
    logError('Unhandled promise rejection — server stays up', reason);
  });

  process.on('uncaughtException', (error) => {
    if (isClientAbort(error)) {
      logError(yellow('Client disconnected mid-response (ignored)'), error);
      return;
    }
    logError('Uncaught exception — server stays up', error);
  });

  // stdout closing (e.g. `| head`) must not kill the server either
  process.stdout.on('error', () => {});
  process.stderr.on('error', () => {});
}

/** Test helper: allows re-installing guards in a fresh process state. */
export function resetProcessGuardsForTests() {
  installed = false;
}
