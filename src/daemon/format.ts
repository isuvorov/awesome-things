import { homedir } from 'node:os';
import {
  bold,
  cyan,
  dim,
  green,
  magenta,
  red,
  stripAnsi,
  useColor,
  yellow,
} from '../server/logger.js';
import { APP_ID } from '../server/port.js';
import type { DaemonActionName, DaemonResult } from './ops.js';

export function tildify(path: string, home: string = homedir()): string {
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const HEADLINES: Record<DaemonActionName, string> = {
  install: 'daemon installed',
  uninstall: 'daemon removed',
  start: 'daemon started',
  stop: 'daemon stopped',
  restart: 'daemon restarted',
  status: 'daemon status',
  up: 'daemon up',
};

/**
 * Whose name macOS sees for Automation: the launcher bundle, or — without it — the runtime
 * itself, which is worth flagging, because granting it covers every script on that runtime.
 */
export function formatIdentity(program: string[]): string {
  const first = program[0] ?? '';
  const bundle = first.match(/([^/]+\.app)\/Contents\/MacOS\//);
  if (bundle)
    return `${green(bundle[1]!)} ${dim(`(${tildify(first.slice(0, first.indexOf('/Contents/')))})`)}`;
  return `${yellow(tildify(first))} ${dim('— no launcher, Automation is granted to the runtime')}`;
}

/** One line that answers "is it actually working?" — the only line most runs need. */
export function formatState(result: DaemonResult): string {
  if (!result.installed) {
    // A port that answers without an agent means a hand-started server — say so,
    // otherwise `daemon install` looks broken when it refuses to take the port.
    return result.healthy
      ? `${red('not installed')} · ${yellow('port answered by a manually started server')}`
      : red('not installed');
  }
  if (result.running) {
    const pid = result.pid ? dim(` (pid ${result.pid})`) : '';
    return result.healthy
      ? `${green('running')}${pid} · ${green('healthy')}`
      : `${yellow('running')}${pid} · ${yellow('not answering /health')}`;
  }
  if (result.healthy) return `${yellow('not managed by launchd')} · ${green('port answers')}`;
  const exit =
    result.lastExitCode !== undefined && result.lastExitCode !== 0
      ? dim(` (last exit code ${result.lastExitCode})`)
      : '';
  return result.loaded ? `${yellow('loaded, not running')}${exit}` : `${yellow('stopped')}${exit}`;
}

function nextCommands(result: DaemonResult): Array<[string, string]> {
  if (result.action === 'uninstall') {
    return [[`${APP_ID} daemon install`, 'install it again']];
  }
  if (!result.installed) {
    return [[`${APP_ID} daemon install`, 'install the agent and start it']];
  }
  const commands: Array<[string, string]> = [
    [`${APP_ID} daemon logs -f`, 'follow the logs live'],
    [`${APP_ID} daemon status`, 'check whether it is alive'],
  ];
  if (result.action === 'stop') {
    commands.unshift([`${APP_ID} daemon start`, 'start it again']);
  } else if (!result.running && result.healthy) {
    // A hand-started server holds the port — the one thing to do is hand it over to launchd.
    commands.unshift([`${APP_ID} daemon start`, 'after stopping the hand-started server']);
  } else {
    commands.push([`${APP_ID} daemon restart`, 'restart it after an update']);
  }
  return commands;
}

export function formatDaemonResult(result: DaemonResult): string {
  const arrow = green(bold('➜'));
  const pad = (s: string) => s.padEnd(9);
  const lines: string[] = [];
  const row = (label: string, value: string) => lines.push(`  ${arrow}  ${pad(label)} ${value}`);

  lines.push('');
  lines.push(
    `  ${bold(green(APP_ID))} ${bold(HEADLINES[result.action])}${result.ok ? '' : ` ${red('— failed')}`}`,
  );
  lines.push('');

  row('Status:', formatState(result));
  if (result.installed) {
    row('WEB:', cyan(result.url));
    row('API:', magenta(`${result.url}/api`));
    if (result.token) row('Token:', yellow(result.token));
    row('Label:', dim(result.label));
    row('Plist:', dim(tildify(result.plist)));
    if (result.program?.length) row('Runs as:', formatIdentity(result.program));
  }
  row('Logs:', `${dim(tildify(result.logs.out))} ${dim(`(${formatBytes(result.logs.outSize)})`)}`);
  lines.push(
    `  ${' '.repeat(3)}${pad('')} ${dim(tildify(result.logs.err))} ${dim(`(${formatBytes(result.logs.errSize)})`)}`,
  );

  if (result.warnings.length) {
    lines.push('');
    for (const warning of result.warnings) lines.push(`  ${yellow('⚠')}  ${warning}`);
  }

  const commands = nextCommands(result);
  const width = Math.max(...commands.map(([cmd]) => cmd.length));
  lines.push('');
  lines.push(dim('  ── Next ──'));
  for (const [cmd, description] of commands) {
    lines.push(`  ${cyan(cmd.padEnd(width))}  ${dim(description)}`);
  }
  for (const hint of result.hints) lines.push(`  ${dim(hint)}`);
  lines.push('');

  const text = lines.join('\n');
  return useColor ? text : stripAnsi(text);
}
