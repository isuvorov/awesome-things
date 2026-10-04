import { bold, cyan, dim, green, magenta, stripAnsi, useColor, yellow } from './logger.js';
import { APP_ID } from './port.js';

/**
 * What a second `server` can say about the instance already holding the port. It cannot
 * take the port, and it cannot read the other process's stdout either — the two share no
 * terminal. Reporting where that instance lives is the useful part.
 */
export function formatAlreadyRunning(port: number, token: string | undefined): string {
  const base = `http://localhost:${port}`;
  const arrow = green(bold('➜'));
  const pad = (s: string) => s.padEnd(9);
  const lines = [
    '',
    `  ${bold(green(APP_ID))} ${bold('is already running')} ${dim(`on port ${port}`)}`,
    '',
    `  ${arrow}  ${pad('WEB:')} ${cyan(base)}`,
    `  ${arrow}  ${pad('API:')} ${magenta(`${base}/api`)}`,
  ];
  if (token) lines.push(`  ${arrow}  ${pad('Token:')} ${yellow(token)}`);
  lines.push(`  ${arrow}  ${pad('MCP:')} ${cyan(`${base}/mcp`)}`);
  lines.push('');
  lines.push(dim('  ── Next ──'));
  lines.push(`  ${cyan('awesome-things daemon logs -f')}  ${dim('follow the logs live')}`);
  lines.push(`  ${cyan('awesome-things daemon status ')}  ${dim('check whether it is alive')}`);
  lines.push('');

  const text = lines.join('\n');
  return useColor ? text : stripAnsi(text);
}

/**
 * The launchd agent, when it is the thing holding this port. Only then is there a log
 * file to follow: a hand-started server writes to a terminal this process cannot reach.
 */
export async function runningDaemonOnPort(port: number) {
  if (process.platform !== 'darwin') return null;
  try {
    const { daemonStatus } = await import('../daemon/ops.js');
    const status = await daemonStatus();
    return status.installed && status.running && status.port === port ? status : null;
  } catch {
    return null;
  }
}

/**
 * Report the running instance and, when it is the daemon, attach to its logs — the
 * closest thing to "connect to the first one" that two separate processes can do.
 */
export async function attachToRunning(port: number, token: string | undefined): Promise<void> {
  const daemon = await runningDaemonOnPort(port);
  if (!daemon) {
    console.log(formatAlreadyRunning(port, token));
    return;
  }

  const { formatDaemonResult } = await import('../daemon/format.js');
  console.log(formatDaemonResult(daemon));

  // Only a human at a terminal wants an endless tail; a script must still exit.
  if (!process.stdout.isTTY) return;
  const { runLogs } = await import('../daemon/logs.js');
  await runLogs({ follow: true, lines: 20 });
}
