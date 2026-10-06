import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { appName } from '../config.js';
import { run } from './launchctl.js';
import { daemonLabel } from './paths.js';
import { escapeXml } from './plist.js';

/**
 * macOS grants Automation to the *responsible process*, and children inherit it: `osascript`
 * from a terminal acts as the terminal, and under launchd it acts as the job's own binary —
 * `bun` or `node`. Granting that would let every script on the runtime drive Things3.
 *
 * So the job starts this launcher instead: a compiled binary inside its own app bundle that
 * spawns the runtime as a child (no exec) and forwards signals. The launcher stays the
 * responsible process, macOS asks "awesome-things wants to control Things3", and the grant
 * covers this bundle only.
 */
export const LAUNCHER_SOURCE = `#include <errno.h>
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

extern char **environ;
static volatile pid_t child = 0;

static void forward(int sig) {
  if (child > 0) kill(child, sig);
}

int main(int argc, char *argv[]) {
  if (argc < 2) {
    fprintf(stderr, "usage: %s <program> [args...]\\n", argv[0]);
    return 64;
  }

  struct sigaction sa;
  memset(&sa, 0, sizeof sa);
  sa.sa_handler = forward;
  sigaction(SIGTERM, &sa, NULL);
  sigaction(SIGINT, &sa, NULL);
  sigaction(SIGHUP, &sa, NULL);

  pid_t pid;
  int err = posix_spawn(&pid, argv[1], NULL, NULL, &argv[1], environ);
  if (err != 0) {
    fprintf(stderr, "${appName} launcher: cannot start %s: %s\\n", argv[1], strerror(err));
    return 127;
  }
  child = pid;

  int status;
  while (waitpid(pid, &status, 0) < 0) {
    if (errno != EINTR) return 1;
  }
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
  return 1;
}
`;

/** The bundle id is the identity macOS shows and remembers in Privacy & Security → Automation. */
export const launcherBundleId = daemonLabel;

const LSREGISTER =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

/**
 * `assets/AppIcon.icns` in the package. Searched upwards: the code runs from `src/daemon/` in the
 * repo and from a flattened `lib/` once built, so no fixed `../..` fits both.
 */
export function findAppIcon(start: string = import.meta.dirname): string | undefined {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const icon = join(dir, 'assets', 'AppIcon.icns');
    if (existsSync(icon)) return icon;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export interface LauncherPaths {
  app: string;
  executable: string;
  infoPlist: string;
  source: string;
  stamp: string;
}

export function launcherPaths(
  home: string = homedir(),
  env: Record<string, string | undefined> = process.env,
): LauncherPaths {
  const base = join(env.XDG_DATA_HOME || join(home, '.local', 'share'), appName);
  const app = join(base, `${appName}.app`);
  return {
    app,
    executable: join(app, 'Contents', 'MacOS', appName),
    infoPlist: join(app, 'Contents', 'Info.plist'),
    // Outside the bundle: anything written into it after codesign breaks the seal.
    source: join(base, 'launcher.c'),
    stamp: join(base, 'launcher.sha256'),
  };
}

export function buildInfoPlist({
  bundleId = launcherBundleId,
  name = appName,
  // Fixed on purpose: an npm release must not change the signature and cost a permission prompt.
  version = '1',
  icon = false,
}: {
  bundleId?: string;
  name?: string;
  version?: string;
  /** Contents/Resources/AppIcon.icns is in the bundle. */
  icon?: boolean;
} = {}): string {
  const entries: Array<[string, string]> = [
    ['CFBundleIdentifier', `<string>${escapeXml(bundleId)}</string>`],
    ['CFBundleName', `<string>${escapeXml(name)}</string>`],
    ['CFBundleDisplayName', `<string>${escapeXml(name)}</string>`],
    ['CFBundleExecutable', `<string>${escapeXml(name)}</string>`],
    ['CFBundlePackageType', '<string>APPL</string>'],
    ['CFBundleVersion', `<string>${escapeXml(version)}</string>`],
    ['CFBundleShortVersionString', `<string>${escapeXml(version)}</string>`],
    // No Dock icon, no menu bar — it is a process wrapper, not an app anyone opens.
    ['LSBackgroundOnly', '<true/>'],
    ...(icon
      ? ([['CFBundleIconFile', '<string>AppIcon</string>']] as Array<[string, string]>)
      : []),
    [
      'NSAppleEventsUsageDescription',
      '<string>awesome-things reads and edits your Things3 to-dos for the HTTP API and MCP server.</string>',
    ],
  ];
  const body = entries.map(([key, value]) => `  <key>${key}</key>\n  ${value}`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
</dict>
</plist>
`;
}

/**
 * Rebuilding re-signs the bundle with a new code hash, and macOS asks for Automation again —
 * so the stamp covers exactly what ends up in the binary and Info.plist, and nothing else.
 */
export function launcherFingerprint(icon: string | undefined = findAppIcon()): string {
  const hash = createHash('sha256')
    .update(LAUNCHER_SOURCE)
    .update(buildInfoPlist({ icon: Boolean(icon) }));
  if (icon) hash.update(readFileSync(icon));
  return hash.digest('hex');
}

export interface LauncherResult {
  executable?: string;
  /** Freshly compiled and signed — macOS will ask for Automation on the first Things3 call. */
  built: boolean;
  error?: string;
}

/** Compile and ad-hoc sign the bundle, unless the one on disk already matches. */
export async function ensureLauncher(
  paths: LauncherPaths = launcherPaths(),
  icon: string | undefined = findAppIcon(),
): Promise<LauncherResult> {
  const fingerprint = launcherFingerprint(icon);
  if (existsSync(paths.executable) && readText(paths.stamp) === fingerprint) {
    return { executable: paths.executable, built: false };
  }

  rmSync(paths.app, { recursive: true, force: true });
  mkdirSync(join(paths.app, 'Contents', 'MacOS'), { recursive: true });
  writeFileSync(paths.infoPlist, buildInfoPlist({ icon: Boolean(icon) }), 'utf-8');
  if (icon) {
    // Before codesign: the seal covers Resources, and a file added later breaks it.
    mkdirSync(join(paths.app, 'Contents', 'Resources'), { recursive: true });
    copyFileSync(icon, join(paths.app, 'Contents', 'Resources', 'AppIcon.icns'));
  }
  writeFileSync(paths.source, LAUNCHER_SOURCE, 'utf-8');

  const cc = await run('xcrun', ['cc', '-O2', '-o', paths.executable, paths.source]);
  if (cc.code !== 0) {
    rmSync(paths.app, { recursive: true, force: true });
    return {
      built: false,
      error: `cannot compile the launcher (${cc.stderr.trim() || `exit ${cc.code}`}) — install the Command Line Tools with "xcode-select --install"`,
    };
  }

  // Ad-hoc, with the bundle id as identifier: Automation remembers this signature, not a path.
  const sign = await run('codesign', [
    '--force',
    '--sign',
    '-',
    '--identifier',
    launcherBundleId,
    paths.app,
  ]);
  if (sign.code !== 0) {
    rmSync(paths.app, { recursive: true, force: true });
    return { built: false, error: `cannot sign the launcher: ${sign.stderr.trim()}` };
  }

  writeFileSync(paths.stamp, fingerprint, 'utf-8');
  // Tell LaunchServices about the bundle, so System Settings shows its icon instead of "exec".
  // Best effort: the launcher works without it.
  await run(LSREGISTER, ['-f', paths.app]);
  return { executable: paths.executable, built: true };
}

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return undefined;
  }
}
