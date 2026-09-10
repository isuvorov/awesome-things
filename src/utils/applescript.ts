/**
 * AppleScript execution layer for Things3.
 * Provides utilities for running osascript commands and building AppleScript syntax.
 */

import { execFile } from 'node:child_process';

const debug = process.env.DEBUG;

interface OsascriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Runs osascript and resolves even when it exits non-zero — the caller reports the error. */
function spawnOsascript(script: string): Promise<OsascriptResult> {
  return new Promise((resolve) => {
    execFile(
      'osascript',
      ['-e', script],
      { maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err?.code;
        resolve({
          stdout: stdout ?? '',
          stderr: stderr || (err && code === undefined ? err.message : ''),
          exitCode: typeof code === 'number' ? code : err ? 1 : 0,
        });
      },
    );
  });
}

/**
 * When macOS refuses to hand over an app's scripting dictionary, AppleScript stops
 * recognising its terms: `to do` is no longer a class, `tags` becomes a plain
 * variable. Every call fails at once, with errors that look like our own syntax
 * bugs — so name the real cause instead of forwarding raw osascript output.
 */
export function isTerminologyFailure(stderr: string): boolean {
  return (
    /\(-274[01]\)/.test(stderr) ||
    /-1743/.test(stderr) ||
    /The variable (to|to ?dos?|tags|areas|projects|lists) is not defined/.test(stderr) ||
    /Expected (class name|expression) but found “?to”?/.test(stderr) ||
    /Application isn’t running|Application isn't running/.test(stderr)
  );
}

function isDebug(): boolean {
  return debug === '*' || debug === 'applescript' || debug === 'things';
}

export async function execute(script: string): Promise<string> {
  if (isDebug()) {
    console.error('\x1b[2m[applescript] ▶\x1b[0m', script.replace(/\n/g, ' \\n '));
  }

  // node:child_process, not Bun.spawn — the published bin runs on plain Node.
  const { stdout, stderr, exitCode } = await spawnOsascript(script);

  if (exitCode !== 0) {
    const detail = stderr.trim();
    if (isDebug()) {
      console.error('\x1b[31m[applescript] ✗\x1b[0m', detail);
    }
    if (isTerminologyFailure(detail)) {
      throw new Error(
        'Things3 scripting is unavailable: macOS did not hand this process the ' +
          'Things3 AppleScript dictionary, so `to do`, `tags` and friends stopped ' +
          'being known terms. Check that Things3 is running, and that the app you ' +
          'started this server from is allowed under System Settings → Privacy & ' +
          `Security → Automation. Raw error: ${detail}`,
      );
    }
    // osascript sometimes exits non-zero with nothing on stderr — an empty
    // "AppleScript error (code 1): " tells the caller nothing at all.
    if (!detail) {
      const output = stdout.trim();
      throw new Error(
        `AppleScript failed with exit code ${exitCode} and no error text` +
          `${output ? ` (output: ${output})` : ''}. Things3 rejected the command; ` +
          'run with DEBUG=applescript to see the script that was sent.',
      );
    }
    throw new Error(`AppleScript error (code ${exitCode}): ${detail}`);
  }

  if (isDebug()) {
    const result = stdout.trim();
    console.error('\x1b[32m[applescript] ✓\x1b[0m', result || '(empty)');
  }

  return stdout.trim();
}

export function tellThings(command: string): string {
  return `tell application "Things3"\n${command}\nend tell`;
}

export function quoteString(s: string): string {
  const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function buildProperties(props: [string, string][]): string {
  if (props.length === 0) {
    return '{}';
  }
  const parts = props.map(([key, value]) => `${key}:${value}`);
  return `{${parts.join(', ')}}`;
}

/**
 * Build AppleScript lines to create a date variable from an ISO date string (YYYY-MM-DD).
 * Returns the variable name that holds the constructed date.
 */
export function buildDateVar(isoDate: string, varName = 'dueD'): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return [
    `set ${varName} to current date`,
    `set day of ${varName} to 1`,
    `set year of ${varName} to ${year}`,
    `set month of ${varName} to ${month}`,
    `set day of ${varName} to ${day}`,
    `set time of ${varName} to 0`,
  ].join('\n');
}

export function todoRef(args: { id?: string; todo_name?: string; name?: string }): string {
  const id = args.id;
  const name = 'todo_name' in args ? args.todo_name : args.name;
  if (id) return `to do id ${quoteString(id)}`;
  if (name) return `to do named ${quoteString(name)}`;
  throw new Error('Either id or name must be provided');
}

export function todoLabel(args: { id?: string; todo_name?: string; name?: string }): string {
  const name = 'todo_name' in args ? args.todo_name : args.name;
  return name ? `"${name}"` : `id:${args.id}`;
}

export function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
