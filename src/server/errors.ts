/**
 * Anything can be thrown or rejected in JS — including `undefined`.
 * These helpers turn any value into something a human can read,
 * so the server never prints a bare "error: undefined".
 */

const MAX_STACK_LINES = 8;
const MAX_CAUSE_DEPTH = 3;

/** Short, single-line description — safe for HTTP responses and log lines. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || 'Error';
  if (typeof err === 'string') return err || 'Empty error string';
  if (err === undefined) return 'undefined (thrown/rejected without a reason)';
  if (err === null) return 'null (thrown/rejected without a reason)';
  if (typeof err === 'object') {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
    try {
      return JSON.stringify(err) ?? String(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/** Multi-line description with stack, error code, aggregated errors and causes. */
export function formatError(err: unknown): string {
  return formatErrorLines(err, 0).join('\n');
}

function formatErrorLines(err: unknown, depth: number): string[] {
  if (depth > MAX_CAUSE_DEPTH) return ['… (cause chain truncated)'];

  if (!(err instanceof Error)) {
    return [`${errorMessage(err)}  [typeof ${typeof err}]`];
  }

  const lines = [`${err.name}: ${errorMessage(err)}`];

  const code = (err as { code?: unknown }).code;
  if (code !== undefined) lines.push(`code: ${String(code)}`);

  if (err.stack) {
    const frames = err.stack
      .split('\n')
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean);
    lines.push(...frames.slice(0, MAX_STACK_LINES));
    if (frames.length > MAX_STACK_LINES) lines.push(`… ${frames.length - MAX_STACK_LINES} more`);
  }

  const aggregated = (err as { errors?: unknown }).errors;
  if (Array.isArray(aggregated)) {
    for (const inner of aggregated) {
      lines.push('contains:');
      lines.push(...formatErrorLines(inner, depth + 1).map((line) => `  ${line}`));
    }
  }

  const cause = (err as { cause?: unknown }).cause;
  if (cause !== undefined) {
    lines.push('caused by:');
    lines.push(...formatErrorLines(cause, depth + 1).map((line) => `  ${line}`));
  }

  return lines;
}

const ABORT_CODES = new Set([
  'ABORT_ERR',
  'ECONNABORTED',
  'ECONNRESET',
  'EPIPE',
  'ERR_STREAM_PREMATURE_CLOSE',
]);

const ABORT_PATTERNS = [
  /abort/i,
  /(connection|socket|stream|pipe|request)\s+(was\s+|has\s+been\s+)?(closed|reset|broken)/i,
  /closed the connection/i,
  /premature close/i,
  /broken pipe/i,
  /client (disconnected|went away)/i,
];

/**
 * True for the everyday "client hung up mid-response" errors.
 * These are normal for SSE/MCP traffic and must never look like a crash.
 */
export function isClientAbort(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { name, code, message } = err as { name?: unknown; code?: unknown; message?: unknown };
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  if (typeof code === 'string' && ABORT_CODES.has(code)) return true;
  if (typeof message !== 'string') return false;
  return ABORT_PATTERNS.some((pattern) => pattern.test(message));
}
