import { describe, expect, test } from 'bun:test';
import { formatBytes, formatDaemonResult, formatState, tildify } from '../src/daemon/format.js';
import {
  isAlreadyLoaded,
  isNotLoaded,
  parseLaunchctlPrint,
  type RunResult,
} from '../src/daemon/launchctl.js';
import { buildTailArgs, logFiles, wantsFollow } from '../src/daemon/logs.js';
import {
  type DaemonResult,
  hasConfigOverrides,
  planInstall,
  planUp,
  portOwner,
  stableExecPath,
} from '../src/daemon/ops.js';
import { daemonLabel, daemonPaths, logDir, serviceId, serviceTarget } from '../src/daemon/paths.js';
import {
  buildPath,
  buildPlist,
  collectEnvironment,
  escapeXml,
  resolveProgramArguments,
} from '../src/daemon/plist.js';
import { stripAnsi } from '../src/server/logger.js';

const HOME = '/Users/dev';
const BUN = '/Users/dev/.bun/bin/bun';

describe('daemonPaths', () => {
  const paths = daemonPaths(HOME);

  test('puts the agent where launchd looks for user agents', () => {
    expect(paths.plist).toBe(`${HOME}/Library/LaunchAgents/${daemonLabel}.plist`);
  });

  test('puts the logs under XDG_DATA_HOME, like every other tool in this setup', () => {
    expect(paths.logDir).toBe(`${HOME}/.local/share/awesome-things/logs`);
    expect(paths.outLog).toBe(`${HOME}/.local/share/awesome-things/logs/server.log`);
    expect(paths.errLog).toBe(`${HOME}/.local/share/awesome-things/logs/server.error.log`);
  });

  test('honours XDG_DATA_HOME and a direct override', () => {
    expect(logDir(HOME, { XDG_DATA_HOME: '/data' })).toBe('/data/awesome-things/logs');
    expect(logDir(HOME, { AWESOME_THINGS_LOG_DIR: '/tmp/at' })).toBe('/tmp/at');
    // The direct override wins — it is the escape hatch, not a suggestion.
    expect(logDir(HOME, { XDG_DATA_HOME: '/data', AWESOME_THINGS_LOG_DIR: '/tmp/at' })).toBe(
      '/tmp/at',
    );
  });

  test('targets the GUI domain — AppleScript needs an Aqua session', () => {
    expect(serviceTarget(501)).toBe('gui/501');
    expect(serviceId(501)).toBe(`gui/501/${daemonLabel}`);
  });
});

describe('buildPath', () => {
  test('puts the runtime bin dir first so frpc and bun are found', () => {
    const path = buildPath(BUN, '/usr/bin:/bin');
    expect(path.split(':')[0]).toBe('/Users/dev/.bun/bin');
  });

  test('keeps the inherited PATH and appends the system defaults', () => {
    const parts = buildPath(BUN, '/opt/custom/bin').split(':');
    expect(parts).toContain('/opt/custom/bin');
    expect(parts).toContain('/opt/homebrew/bin');
    expect(parts).toContain('/usr/bin');
  });

  test('never repeats a directory', () => {
    const parts = buildPath('/usr/bin/node', '/usr/bin:/bin:/usr/bin').split(':');
    expect(new Set(parts).size).toBe(parts.length);
  });

  test('survives an empty PATH', () => {
    expect(buildPath(BUN).split(':')).toContain('/usr/bin');
  });
});

describe('collectEnvironment', () => {
  const env = {
    AWESOME_THINGS_TOKEN: 'inherited-token',
    AWESOME_THINGS_URL_TOKEN: 'url-token',
    AWESOME_THINGS_TUNNEL: 'frp',
    AWESOME_THINGS_FRP_SERVER_ADDR: 'frp.example.com',
    FRP_TOKEN: 'frp-secret',
    NGROK_AUTHTOKEN: 'ngrok-secret',
    PATH: '/usr/bin',
    UNRELATED_SECRET: 'must not leak',
  };

  test('forwards everything the server needs', () => {
    const result = collectEnvironment({ execPath: BUN, home: HOME, env });
    expect(result.AWESOME_THINGS_URL_TOKEN).toBe('url-token');
    expect(result.AWESOME_THINGS_TUNNEL).toBe('frp');
    expect(result.NGROK_AUTHTOKEN).toBe('ngrok-secret');
  });

  test('forwards the whole frp family', () => {
    const result = collectEnvironment({ execPath: BUN, home: HOME, env });
    expect(result.AWESOME_THINGS_FRP_SERVER_ADDR).toBe('frp.example.com');
    expect(result.FRP_TOKEN).toBe('frp-secret');
  });

  test('does not copy unrelated environment variables', () => {
    const result = collectEnvironment({ execPath: BUN, home: HOME, env });
    expect(result.UNRELATED_SECRET).toBeUndefined();
  });

  test('always sets HOME and PATH — launchd provides neither', () => {
    const result = collectEnvironment({ execPath: BUN, home: HOME, env: {} });
    expect(result.HOME).toBe(HOME);
    expect(result.PATH).toContain('/usr/bin');
  });

  test('pins the token so restarts keep the same one', () => {
    const result = collectEnvironment({ execPath: BUN, home: HOME, env, token: 'pinned' });
    expect(result.AWESOME_THINGS_TOKEN).toBe('pinned');
  });

  test('noToken drops an inherited token instead of silently keeping auth on', () => {
    const result = collectEnvironment({ execPath: BUN, home: HOME, env, noToken: true });
    expect(result.AWESOME_THINGS_TOKEN).toBeUndefined();
  });

  test('forces colour, since launchd gives the job no TTY to detect', () => {
    expect(collectEnvironment({ execPath: BUN, home: HOME, env, color: true }).FORCE_COLOR).toBe(
      '1',
    );
    expect(
      collectEnvironment({ execPath: BUN, home: HOME, env, color: false }).FORCE_COLOR,
    ).toBeUndefined();
  });

  test('colour beats an inherited NO_COLOR instead of silently losing to it', () => {
    const result = collectEnvironment({
      execPath: BUN,
      home: HOME,
      env: { ...env, NO_COLOR: '1' },
      color: true,
    });
    expect(result.NO_COLOR).toBeUndefined();
    expect(result.FORCE_COLOR).toBe('1');
  });

  test('overrides port, tunnel and domain', () => {
    const result = collectEnvironment({
      execPath: BUN,
      home: HOME,
      env,
      port: 41234,
      tunnel: 'ngrok',
      domain: 'things.example.com',
    });
    expect(result.AWESOME_THINGS_PORT).toBe('41234');
    expect(result.AWESOME_THINGS_TUNNEL).toBe('ngrok');
    expect(result.AWESOME_THINGS_DOMAIN).toBe('things.example.com');
  });
});

describe('resolveProgramArguments', () => {
  test('runs the CLI through its runtime, never relying on a shebang', () => {
    expect(resolveProgramArguments({ execPath: BUN, bin: '/opt/app/lib/cli.js' })).toEqual([
      BUN,
      '/opt/app/lib/cli.js',
      'server',
    ]);
  });

  test('passes --no-token through, since env cannot express it', () => {
    const args = resolveProgramArguments({
      execPath: BUN,
      bin: '/opt/app/lib/cli.js',
      noToken: true,
    });
    expect(args).toEqual([BUN, '/opt/app/lib/cli.js', 'server', '--no-token']);
  });
});

describe('escapeXml', () => {
  test('escapes every character that would break a plist', () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
  });
});

describe('buildPlist', () => {
  const plist = buildPlist({
    label: daemonLabel,
    programArguments: [BUN, '/opt/app/lib/cli.js', 'server'],
    environment: { AWESOME_THINGS_TOKEN: 'tok&en', PATH: '/usr/bin' },
    workingDirectory: HOME,
    outLog: `${HOME}/Library/Logs/awesome-things/server.log`,
    errLog: `${HOME}/Library/Logs/awesome-things/server.error.log`,
  });

  test('is a well-formed plist document', () => {
    expect(plist.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(plist).toContain('<!DOCTYPE plist PUBLIC');
    expect(plist.trimEnd().endsWith('</plist>')).toBe(true);
  });

  test('carries the label launchctl addresses the job by', () => {
    expect(plist).toContain(`<key>Label</key>\n  <string>${daemonLabel}</string>`);
  });

  test('keeps the program arguments in order', () => {
    const args = [...plist.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]);
    expect(args.slice(0, 3)).toEqual([daemonLabel, BUN, '/opt/app/lib/cli.js']);
  });

  test('escapes environment values', () => {
    expect(plist).toContain('<string>tok&amp;en</string>');
  });

  test('starts at login and restarts only after a crash', () => {
    expect(plist).toContain('<key>RunAtLoad</key>\n  <true/>');
    // A clean exit means the server found the port taken by its own twin — never respawn it.
    expect(plist).toContain('<key>SuccessfulExit</key>\n    <false/>');
    expect(plist).toContain('<key>ThrottleInterval</key>\n  <integer>10</integer>');
  });

  test('redirects both streams to files, which is the only way to read them later', () => {
    expect(plist).toContain('<key>StandardOutPath</key>');
    expect(plist).toContain('server.log</string>');
    expect(plist).toContain('<key>StandardErrorPath</key>');
    expect(plist).toContain('server.error.log</string>');
  });
});

const result = (code: number, stdout = '', stderr = ''): RunResult => ({ code, stdout, stderr });

describe('parseLaunchctlPrint', () => {
  test('reads a running job', () => {
    const state = parseLaunchctlPrint(
      result(0, ['\tstate = running', '\tpid = 4242', '\tlast exit code = 0'].join('\n')),
    );
    expect(state).toEqual({ loaded: true, running: true, pid: 4242, lastExitCode: 0 });
  });

  test('reads a loaded but idle job', () => {
    const state = parseLaunchctlPrint(
      result(0, ['\tstate = waiting', '\tlast exit code = 78'].join('\n')),
    );
    expect(state.loaded).toBe(true);
    expect(state.running).toBe(false);
    expect(state.pid).toBeUndefined();
    expect(state.lastExitCode).toBe(78);
  });

  test('treats "could not find service" as not loaded', () => {
    const state = parseLaunchctlPrint(result(113, '', 'Could not find service in domain'));
    expect(state).toEqual({ loaded: false, running: false });
  });

  test('never throws on unexpected output', () => {
    expect(parseLaunchctlPrint(result(0, 'garbage'))).toEqual({ loaded: true, running: false });
  });
});

describe('launchctl error classification', () => {
  test('recognises an already-loaded job', () => {
    expect(isAlreadyLoaded(result(5, '', 'Load failed: 5: Input/output error'))).toBe(true);
    expect(isAlreadyLoaded(result(17, '', 'service already loaded'))).toBe(true);
    expect(isAlreadyLoaded(result(1, '', 'Permission denied'))).toBe(false);
  });

  test('recognises a job that was never loaded', () => {
    expect(isNotLoaded(result(3, '', 'Boot-out failed: 3: No such process'))).toBe(true);
    expect(isNotLoaded(result(1, '', 'Permission denied'))).toBe(false);
  });
});

describe('logs', () => {
  test('follows both streams by default', () => {
    expect(logFiles('all')).toHaveLength(2);
    expect(logFiles('err')).toEqual([daemonPaths().errLog]);
    expect(logFiles('out')).toEqual([daemonPaths().outLog]);
  });

  test('tails the requested number of lines', () => {
    expect(buildTailArgs({ lines: 120 }, ['/tmp/a.log'])).toEqual(['-n', '120', '/tmp/a.log']);
  });

  test('only an explicit boolean follows — -f is the global alias for --format', () => {
    expect(wantsFollow(true)).toBe(true);
    // yargs hands `follow` the --format default through the shared `-f` alias; a truthy
    // string there used to make a plain `daemon logs` tail forever.
    expect(wantsFollow('pretty')).toBe(false);
    expect(wantsFollow(undefined)).toBe(false);
    expect(wantsFollow(false)).toBe(false);
  });

  test('uses -F so following survives a log rotation', () => {
    expect(buildTailArgs({ follow: true }, ['/tmp/a.log'])).toEqual([
      '-n',
      '50',
      '-F',
      '/tmp/a.log',
    ]);
  });
});

describe('tildify & formatBytes', () => {
  test('shortens paths under home', () => {
    expect(tildify(`${HOME}/Library/Logs/x.log`, HOME)).toBe('~/Library/Logs/x.log');
    expect(tildify('/var/log/x.log', HOME)).toBe('/var/log/x.log');
  });

  test('scales byte counts', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

const SAMPLE: DaemonResult = {
  action: 'install',
  ok: true,
  label: daemonLabel,
  plist: `${HOME}/Library/LaunchAgents/${daemonLabel}.plist`,
  installed: true,
  loaded: true,
  running: true,
  healthy: true,
  pid: 4242,
  port: 32123,
  url: 'http://localhost:32123',
  token: 'secret-token',
  logs: {
    out: `${HOME}/Library/Logs/awesome-things/server.log`,
    err: `${HOME}/Library/Logs/awesome-things/server.error.log`,
    outSize: 2048,
    errSize: 0,
  },
  warnings: [],
  hints: [],
};

describe('planUp', () => {
  const state = { installed: true, running: true, healthy: true };

  test('installs when there is no plist yet', () => {
    expect(planUp({ ...state, installed: false, running: false, healthy: false })).toBe('install');
  });

  test('leaves an answering server alone — a restart would drop the tunnel domain', () => {
    expect(planUp(state)).toBe('nothing');
  });

  test('does not touch a healthy server that launchd does not manage', () => {
    expect(planUp({ ...state, running: false })).toBe('nothing');
  });

  test('starts an installed daemon that is down', () => {
    expect(planUp({ ...state, running: false, healthy: false })).toBe('start');
  });

  test('restarts a job launchd holds but that answers nothing — bootstrap would be a no-op', () => {
    expect(planUp({ ...state, healthy: false })).toBe('restart');
  });

  test('reinstalls a plist written by an older version — start would run it unchanged forever', () => {
    expect(planUp({ ...state, running: false, healthy: false, stale: true })).toBe('install');
    expect(planUp({ ...state, stale: true })).toBe('install');
  });

  test('reinstalls when a flag would otherwise be silently ignored', () => {
    expect(planUp({ ...state, overrides: true })).toBe('install');
  });
});

describe('stableExecPath', () => {
  const links: Record<string, string> = {
    '/opt/homebrew/bin/node': '/opt/homebrew/Cellar/node/26.10.0_1/bin/node',
    '/opt/homebrew/Cellar/node/26.10.0_1/bin/node': '/opt/homebrew/Cellar/node/26.10.0_1/bin/node',
  };
  const resolve = (path: string) => links[path];

  test('swaps a Cellar path for the symlink that survives brew upgrade', () => {
    expect(stableExecPath('/opt/homebrew/Cellar/node/26.10.0_1/bin/node', resolve)).toBe(
      '/opt/homebrew/bin/node',
    );
  });

  test('keeps the Cellar path when the symlink points at another version', () => {
    const other = (path: string) =>
      path === '/opt/homebrew/bin/node' ? '/opt/homebrew/Cellar/node/27.0.0/bin/node' : path;
    expect(stableExecPath('/opt/homebrew/Cellar/node/26.10.0_1/bin/node', other)).toBe(
      '/opt/homebrew/Cellar/node/26.10.0_1/bin/node',
    );
  });

  test('leaves every other path alone', () => {
    expect(stableExecPath('/Users/me/.bun/bin/bun', resolve)).toBe('/Users/me/.bun/bin/bun');
  });
});

describe('portOwner', () => {
  const launchd = { running: true, pid: 26920 };

  test('passes a free or foreign port through', () => {
    expect(portOwner({ probe: 'free', launchd })).toBe('free');
    expect(portOwner({ probe: 'other', launchd })).toBe('other');
  });

  test('recognises the daemon itself — install must not call it a hand-started server', () => {
    expect(portOwner({ probe: 'ours', launchd, servingPid: 26920 })).toBe('daemon');
  });

  test('a different pid on the port is a hand-started server', () => {
    expect(portOwner({ probe: 'ours', launchd, servingPid: 4242 })).toBe('manual');
  });

  test('nothing under launchd means the port belongs to a hand-started server', () => {
    expect(portOwner({ probe: 'ours', launchd: { running: false }, servingPid: 4242 })).toBe(
      'manual',
    );
  });

  test('without a pid from /health, launchd running the job decides', () => {
    expect(portOwner({ probe: 'ours', launchd })).toBe('daemon');
  });
});

describe('planInstall', () => {
  test('repeating an install of the same plist restarts nothing', () => {
    expect(planInstall({ owner: 'daemon', changed: false })).toBe('unchanged');
  });

  test('a changed plist reloads the running daemon — launchd never rereads it on its own', () => {
    expect(planInstall({ owner: 'daemon', changed: true })).toBe('reload');
  });

  test('never takes the port from a hand-started server', () => {
    expect(planInstall({ owner: 'manual', changed: true })).toBe('blocked');
    expect(planInstall({ owner: 'manual', changed: false })).toBe('blocked');
  });

  test('a stopped daemon is started even when the plist did not change', () => {
    expect(planInstall({ owner: 'free', changed: false })).toBe('reload');
  });

  test('--no-start only writes the plist', () => {
    expect(planInstall({ owner: 'free', changed: true, start: false })).toBe('deferred');
    expect(planInstall({ owner: 'daemon', changed: true, start: false })).toBe('deferred');
  });
});

describe('hasConfigOverrides', () => {
  test('ignores an empty invocation', () => {
    expect(hasConfigOverrides({})).toBe(false);
    expect(hasConfigOverrides({ start: true })).toBe(false);
  });

  test('catches every setting that lives in the plist', () => {
    expect(hasConfigOverrides({ port: 41234 })).toBe(true);
    expect(hasConfigOverrides({ token: 'x' })).toBe(true);
    expect(hasConfigOverrides({ noToken: true })).toBe(true);
    expect(hasConfigOverrides({ tunnel: 'frp' })).toBe(true);
    expect(hasConfigOverrides({ domain: 'things.example.com' })).toBe(true);
  });
});

describe('formatState', () => {
  test('separates "launchd runs it" from "it actually answers"', () => {
    expect(stripAnsi(formatState(SAMPLE))).toBe('running (pid 4242) · healthy');
    expect(stripAnsi(formatState({ ...SAMPLE, healthy: false }))).toBe(
      'running (pid 4242) · not answering /health',
    );
  });

  test('reports a stopped job with its last exit code', () => {
    const stopped = { ...SAMPLE, running: false, loaded: false, healthy: false, lastExitCode: 1 };
    expect(stripAnsi(formatState(stopped))).toBe('stopped (last exit code 1)');
  });

  test('reports a job that is loaded but not running', () => {
    const idle = { ...SAMPLE, running: false, healthy: false };
    expect(stripAnsi(formatState(idle))).toBe('loaded, not running');
  });

  test('flags a port answered by something outside launchd', () => {
    const manual = { ...SAMPLE, running: false, loaded: false };
    expect(stripAnsi(formatState(manual))).toContain('not managed by launchd');
  });

  test('says so plainly when nothing is installed', () => {
    const missing = { ...SAMPLE, installed: false, healthy: false, running: false };
    expect(stripAnsi(formatState(missing))).toBe('not installed');
  });

  test('explains a port that answers without an installed agent', () => {
    const manual = { ...SAMPLE, installed: false, running: false, loaded: false };
    expect(stripAnsi(formatState(manual))).toBe(
      'not installed · port answered by a manually started server',
    );
  });
});

describe('formatDaemonResult', () => {
  const text = stripAnsi(formatDaemonResult(SAMPLE));

  test('shows where to connect and with what token', () => {
    expect(text).toContain('http://localhost:32123');
    expect(text).toContain('secret-token');
  });

  test('always shows both log files with their sizes', () => {
    expect(text).toContain('Library/Logs/awesome-things/server.log (2 KB)');
    expect(text).toContain('Library/Logs/awesome-things/server.error.log (0 B)');
  });

  test('tells the user how to watch the logs', () => {
    expect(text).toContain('awesome-things daemon logs -f');
    expect(text).toContain('awesome-things daemon status');
  });

  test('leads with daemon start when a hand-started server holds the port', () => {
    const manual = stripAnsi(formatDaemonResult({ ...SAMPLE, running: false, healthy: true }));
    const next = manual.slice(manual.indexOf('── Next ──'));
    expect(next.split('\n')[1]).toContain('awesome-things daemon start');
  });

  test('prints warnings instead of hiding them', () => {
    const withWarning = stripAnsi(
      formatDaemonResult({ ...SAMPLE, warnings: ['Port 32123 is already served'] }),
    );
    expect(withWarning).toContain('⚠  Port 32123 is already served');
  });

  test('marks a failed action', () => {
    expect(stripAnsi(formatDaemonResult({ ...SAMPLE, ok: false }))).toContain('— failed');
  });

  test('names the bare `daemon` action', () => {
    expect(stripAnsi(formatDaemonResult({ ...SAMPLE, action: 'up' }))).toContain('daemon up');
  });

  test('offers to reinstall after an uninstall', () => {
    const removed = stripAnsi(
      formatDaemonResult({ ...SAMPLE, action: 'uninstall', installed: false, running: false }),
    );
    expect(removed).toContain('daemon removed');
    expect(removed).toContain('awesome-things daemon install');
  });
});
