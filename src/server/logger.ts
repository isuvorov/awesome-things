import { appName, appVersion } from '../config.js';
import { formatError } from './errors.js';

// The request box repaints itself with cursor moves — only usable on a real TTY.
const isTty = Boolean(process.stdout.isTTY);

/** True when stdout is a terminal: spinners and cursor tricks are safe. */
export const isInteractive = isTty;

// ── ANSI helpers ──────────────────────────────────────────────────
export const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
export const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
export const green = (s: string) => `\x1b[32m${s}\x1b[39m`;
export const cyan = (s: string) => `\x1b[36m${s}\x1b[39m`;
export const yellow = (s: string) => `\x1b[33m${s}\x1b[39m`;
export const magenta = (s: string) => `\x1b[35m${s}\x1b[39m`;
export const red = (s: string) => `\x1b[31m${s}\x1b[39m`;
export const gray = (s: string) => `\x1b[90m${s}\x1b[39m`;
export const blue = (s: string) => `\x1b[34m${s}\x1b[39m`;
export const brightBlue = (s: string) => `\x1b[94m${s}\x1b[39m`;

export function colorMethod(method: string): string {
  switch (method) {
    case 'GET':
      return green(method);
    case 'POST':
      return cyan(method);
    case 'PUT':
      return yellow(method);
    case 'PATCH':
      return magenta(method);
    case 'DELETE':
      return red(method);
    case 'OPTIONS':
      return dim(method);
    default:
      return method;
  }
}

export function colorStatus(status: number): string {
  if (status < 300) return green(String(status));
  if (status < 400) return cyan(String(status));
  if (status < 500) return yellow(String(status));
  return red(String(status));
}

export function stripAnsi(s: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// ── Request log box ─────────────────────────────────────────────
const BOX_ROWS = 12;
const MIN_INNER_W = 64;
const MAX_INNER_W = 140;
// fixed parts: time(8) + sp + method(7) + sp + sp + status(3) + sp*2 + dur(~6)
const FIXED_COLS = 29;

export interface LogExtra {
  search?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolError?: string;
}

function compactArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null) continue;
    parts.push(`${k}:${typeof v === 'string' ? v : JSON.stringify(v)}`);
  }
  return parts.length ? `{${parts.join(',')}}` : '';
}

function formatRequestLine(
  method: string,
  pathname: string,
  status: number,
  durationMs: number,
  maxPath: number,
  extra?: LogExtra,
) {
  const time = dim(new Date().toLocaleTimeString('en-GB', { hour12: false }));
  const m = colorMethod(method.padEnd(7));
  const s = colorStatus(status);
  const durStr = `${durationMs}ms`;
  const dur = durationMs < 10 ? dim(durStr) : durationMs < 100 ? yellow(durStr) : red(durStr);

  let displayPath = pathname;
  const isMcp = pathname === '/mcp' || pathname.startsWith('/mcp/auth/');
  if (isMcp && extra?.toolName) {
    // /mcp/auth/XYZ + tools/call list_todos → /mcp/list_todos
    displayPath = `/mcp/${extra.toolName}`;
    const argsStr = extra.toolArgs ? compactArgs(extra.toolArgs) : '';
    if (argsStr) displayPath += ` ${argsStr}`;
  } else if (isMcp && pathname.startsWith('/mcp/auth/')) {
    displayPath = '/mcp/...';
  } else if (extra?.search) {
    displayPath += extra.search;
  }

  const path = displayPath.length > maxPath ? `${displayPath.slice(0, maxPath - 1)}…` : displayPath;
  const statusStr = extra?.toolError ? red('ERR') : s;
  return `${time} ${m} ${path.padEnd(maxPath)} ${statusStr}  ${dur}`;
}

class RequestBox {
  private lines: string[] = [];
  private eraseLines: number;
  private boxDrawn = false;
  private innerW: number;
  private maxPath: number;

  constructor(eraseLines: number) {
    this.eraseLines = eraseLines;
    const cols = process.stdout.columns || 80;
    this.innerW = Math.min(MAX_INNER_W, Math.max(MIN_INNER_W, cols - 6));
    this.maxPath = this.innerW - FIXED_COLS;
  }

  log(method: string, pathname: string, status: number, durationMs: number, extra?: LogExtra) {
    this.lines.push(formatRequestLine(method, pathname, status, durationMs, this.maxPath, extra));
    if (this.lines.length > BOX_ROWS) this.lines.shift();
    if (!this.boxDrawn) {
      this.drawInitial();
    } else {
      this.redraw();
    }
  }

  /** Print arbitrary lines (errors, warnings) above the box without breaking its layout. */
  printAbove(lines: string[]) {
    if (!this.boxDrawn) {
      for (const line of lines) process.stdout.write(`${line}\n`);
      return;
    }
    const boxHeight = BOX_ROWS + 2; // borders included
    // Cursor sits right below the box: go up, wipe it, print, then redraw it.
    process.stdout.write(`\x1b[${boxHeight}A`);
    for (let i = 0; i < boxHeight; i++) process.stdout.write('\x1b[2K\n');
    process.stdout.write(`\x1b[${boxHeight}A`);
    for (const line of lines) process.stdout.write(`${line}\x1b[K\n`);
    this.drawFrame();
    this.redraw();
  }

  private drawFrame() {
    const label = '── Requests ';
    const topFill = '─'.repeat(this.innerW + 2 - label.length);
    process.stdout.write(`  ${dim(`┌${label}${topFill}┐`)}\n`);
    for (let i = 0; i < BOX_ROWS; i++) {
      process.stdout.write(`  ${dim('│')} ${' '.repeat(this.innerW)} ${dim('│')}\n`);
    }
    process.stdout.write(`  ${dim(`└${'─'.repeat(this.innerW + 2)}┘`)}\n`);
  }

  private drawInitial() {
    // Erase config lines by moving up and overwriting
    if (this.eraseLines > 0) {
      process.stdout.write(`\x1b[${this.eraseLines}A`);
    }
    this.drawFrame();
    // Clear any leftover config lines below the box
    const leftover = this.eraseLines - (BOX_ROWS + 2);
    for (let i = 0; i < leftover; i++) {
      process.stdout.write('\x1b[2K\n');
    }
    if (leftover > 0) {
      process.stdout.write(`\x1b[${leftover}A`);
    }
    this.boxDrawn = true;
    this.redraw();
  }

  private redraw() {
    // Move cursor up: BOX_ROWS content + 1 bottom border
    process.stdout.write(`\x1b[${BOX_ROWS + 1}A`);
    for (let i = 0; i < BOX_ROWS; i++) {
      const line = this.lines[i] || '';
      const visLen = stripAnsi(line).length;
      const pad = Math.max(0, this.innerW - visLen);
      process.stdout.write(`\r  ${dim('│')} ${line}${' '.repeat(pad)} ${dim('│')}\x1b[K\n`);
    }
    process.stdout.write(`\r  ${dim(`└${'─'.repeat(this.innerW + 2)}┘`)}\x1b[K\n`);
  }
}

let requestBox: RequestBox | null = null;

export function logRequest(
  method: string,
  pathname: string,
  status: number,
  durationMs: number,
  extra?: LogExtra,
) {
  if (requestBox) {
    requestBox.log(method, pathname, status, durationMs, extra);
    return;
  }
  if (!isTty) {
    // Piped to a file / systemd / pm2: plain lines, no ANSI, no cursor tricks.
    console.log(stripAnsi(formatRequestLine(method, pathname, status, durationMs, 80, extra)));
  }
}

/**
 * Log an error without ever throwing from the logger itself and without
 * corrupting the request box. Errors are what the user came here to read.
 */
export function logError(label: string, err: unknown) {
  try {
    const lines = [
      `  ${red('✗')} ${bold(label)}`,
      ...formatError(err)
        .split('\n')
        .map((line) => `    ${dim(line)}`),
    ];
    if (requestBox && isTty) {
      requestBox.printAbove(lines);
      return;
    }
    for (const line of lines) console.error(isTty ? line : stripAnsi(line));
  } catch {
    console.error(`${label}:`, err);
  }
}

function printConfig(label: string, config: object): number {
  console.log(dim(`  ── ${label} ──`));
  const jsonLines = JSON.stringify(config, null, 2).split('\n');
  for (const line of jsonLines) {
    console.log(`  ${dim(line)}`);
  }
  console.log();
  return 1 + jsonLines.length + 1; // header + json + empty line
}

function printInstructions(label: string, lines: string[]): number {
  console.log(dim(`  ── ${label} ──`));
  for (const line of lines) {
    console.log(`  ${dim(line)}`);
  }
  console.log();
  return 1 + lines.length + 1; // header + lines + empty line
}

export function printStartupBanner(opts: {
  port: number;
  startPort: number;
  token: string | undefined;
  tunnelUrl?: string;
  tunnelProvider?: string;
  skipHeader?: boolean;
}) {
  const { port, startPort, token, tunnelUrl, tunnelProvider, skipHeader } = opts;
  const base = `http://localhost:${port}`;
  const arrow = green(bold('➜'));
  const pad = (s: string) => s.padEnd(10);
  const mcpPath = token ? `/mcp/auth/${token}` : '/mcp';

  if (!skipHeader) {
    console.log();
    console.log(`  ${bold(green(appName))} ${dim(`v${appVersion}`)}`);
    console.log();
    if (port !== startPort) {
      console.log(`  ${yellow('⚠')}  Port ${startPort} busy, using ${bold(String(port))}`);
      console.log();
    }
  }

  // Pre-tunnel mode: show local info, tunnel line as pending
  if (tunnelProvider && !tunnelUrl && !skipHeader) {
    // console.log(`  ${arrow}  ${pad('Local:')}  ${cyan(base)}`);
    console.log(`  ${arrow}  ${pad('WEB:')}  ${cyan(`${base}`)}`);
    console.log(`  ${arrow}  ${pad('API:')}  ${magenta(`${base}/api`)}`);
    if (token) {
      console.log(`  ${arrow}  ${pad('Token:')}  ${yellow(token)}`);
    } else {
      console.log(`  ${arrow}  ${pad('Auth:')}  ${yellow('disabled (no token)')}`);
    }
    console.log(`  ${arrow}  ${pad('MCP:')}  ${dim('waiting for tunnel...')}`);
    console.log();
    return;
  }

  let configLines = 0;

  if (tunnelUrl) {
    if (skipHeader) {
      // Redraw: move up to overwrite the MCP + empty line
      process.stdout.write('\x1b[2A');
      console.log(`  ${arrow}  ${pad('MCP:')}  ${green(`${tunnelUrl}${mcpPath}`)}`);
      console.log();
    } else {
      // console.log(`  ${arrow}  ${pad('Local:')}  ${cyan(base)}`);
      console.log(`  ${arrow}  ${pad('WEB:')}  ${cyan(`${tunnelUrl}`)}`);
      console.log(`  ${arrow}  ${pad('API:')}  ${magenta(`${tunnelUrl}/api`)}`);
      if (token) {
        console.log(`  ${arrow}  ${pad('Token:')}  ${yellow(token)}`);
      } else {
        console.log(`  ${arrow}  ${pad('Auth:')}  ${yellow('disabled (no token)')}`);
      }
      console.log(`  ${arrow}  ${pad('MCP:')}  ${green(`${tunnelUrl}${mcpPath}`)}`);
      console.log();
    }
    configLines += printInstructions('MCP for ChatGPT', [
      '1. Open https://chatgpt.com/#settings/Connectors',
      '2. Click "Add" and select "Add custom action"',
      '3. Paste MCP URL and set Authentication to "None"',
    ]);
    configLines += printConfig('MCP config (External)', {
      mcpServers: { things3: { url: `${tunnelUrl}${mcpPath}` } },
    });
  } else if (!tunnelProvider) {
    console.log(`  ${arrow}  ${pad('MCP:')}  ${cyan(`${base}${mcpPath}`)}`);
    if (token) {
      console.log(`  ${arrow}  ${pad('Token:')}  ${yellow(token)}`);
    } else {
      console.log(`  ${arrow}  ${pad('Auth:')}  ${yellow('disabled (no token)')}`);
    }
    console.log();
    configLines += printConfig('MCP config (Localhost MCP)', {
      mcpServers: { things3: { url: `${base}${mcpPath}` } },
    });
  }

  configLines += printConfig('MCP config (CLI)', {
    mcpServers: { things3: { command: `npx -y ${appName} mcp` } },
  });

  requestBox = isTty ? new RequestBox(configLines) : null;
}
