import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatIdentity } from '../src/daemon/format.js';
import {
  buildInfoPlist,
  ensureLauncher,
  type LauncherPaths,
  launcherPaths,
} from '../src/daemon/launcher.js';
import { resolveProgramArguments } from '../src/daemon/plist.js';
import { stripAnsi } from '../src/server/logger.js';

describe('buildInfoPlist', () => {
  const xml = buildInfoPlist();

  test('names the bundle awesome-things — that is what the Automation prompt shows', () => {
    expect(xml).toContain('<key>CFBundleName</key>\n  <string>awesome-things</string>');
    expect(xml).toContain('<string>com.isuvorov.awesome-things</string>');
    expect(xml).toContain('<key>NSAppleEventsUsageDescription</key>');
  });

  test('is a valid plist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'awesome-things-info-'));
    try {
      writeFileSync(join(dir, 'Info.plist'), xml);
      expect(spawnSync('plutil', ['-lint', join(dir, 'Info.plist')]).status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('launcher in ProgramArguments', () => {
  test('comes first, so it is the responsible process', () => {
    expect(
      resolveProgramArguments({
        execPath: '/bun',
        bin: '/cli.js',
        launcher: '/L.app/Contents/MacOS/x',
      }),
    ).toEqual(['/L.app/Contents/MacOS/x', '/bun', '/cli.js', 'server']);
  });

  test('status names the bundle, or flags a bare runtime', () => {
    expect(
      stripAnsi(formatIdentity(['/x/awesome-things.app/Contents/MacOS/awesome-things', '/bun'])),
    ).toStartWith('awesome-things.app');
    expect(stripAnsi(formatIdentity(['/opt/homebrew/bin/bun']))).toContain('no launcher');
  });
});

describe.skipIf(process.platform !== 'darwin')('ensureLauncher (real compile + codesign)', () => {
  let dir: string;
  let paths: LauncherPaths;

  beforeAll(() => {
    // Inside the repo, not $TMPDIR: sandboxed agents may not exec binaries from /var/folders.
    dir = mkdtempSync(join(import.meta.dirname, '..', '.tmp-launcher-'));
    paths = launcherPaths(dir, {});
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test('builds and signs the bundle', async () => {
    const result = await ensureLauncher(paths);
    expect(result.error).toBeUndefined();
    expect(result.built).toBe(true);
    expect(result.executable).toBe(paths.executable);
  }, 30_000);

  test('the signature seals the whole bundle — TCC rejects a broken seal', () => {
    const verify = spawnSync('codesign', ['--verify', '--strict', '--deep', paths.app]);
    expect(verify.stderr.toString()).toBe('');
    expect(verify.status).toBe(0);
    const info = spawnSync('codesign', ['-dv', paths.app]).stderr.toString();
    expect(info).toContain('Identifier=com.isuvorov.awesome-things');
  });

  test('is not rebuilt when nothing changed — a rebuild costs a new permission prompt', async () => {
    const again = await ensureLauncher(paths);
    expect(again.built).toBe(false);
    expect(again.executable).toBe(paths.executable);
  });

  test('passes the child exit code through — KeepAlive depends on it', () => {
    const result = spawnSync(paths.executable, ['/bin/sh', '-c', 'exit 7']);
    expect(result.status).toBe(7);
  });

  test('forwards SIGTERM and reports it as 128 + signal', async () => {
    const child = spawn(paths.executable, ['/bin/sleep', '30']);
    await new Promise((resolve) => setTimeout(resolve, 300));
    child.kill('SIGTERM');
    const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));
    expect(code).toBe(143);
  });

  test('explains a missing program instead of dying silently', () => {
    const result = spawnSync(paths.executable, ['/nope/missing']);
    expect(result.status).toBe(127);
    expect(result.stderr.toString()).toContain('cannot start /nope/missing');
  });
});
