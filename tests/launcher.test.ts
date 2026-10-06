import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatIdentity } from '../src/daemon/format.js';
import {
  buildInfoPlist,
  ensureLauncher,
  findAppIcon,
  findSigningIdentity,
  type LauncherPaths,
  launcherPaths,
  parseIdentities,
  pickIdentity,
} from '../src/daemon/launcher.js';
import { buildPlist, resolveProgramArguments } from '../src/daemon/plist.js';
import { stripAnsi } from '../src/server/logger.js';

describe('buildInfoPlist', () => {
  const xml = buildInfoPlist();

  test('names the bundle awesome-things — that is what the Automation prompt shows', () => {
    expect(xml).toContain('<key>CFBundleName</key>\n  <string>awesome-things</string>');
    expect(xml).toContain('<string>com.isuvorov.awesome-things</string>');
    expect(xml).toContain('<key>NSAppleEventsUsageDescription</key>');
  });

  test('points at the icon only when the bundle carries one', () => {
    expect(xml).not.toContain('CFBundleIconFile');
    expect(buildInfoPlist({ icon: true })).toContain(
      '<key>CFBundleIconFile</key>\n  <string>AppIcon</string>',
    );
  });

  test('finds the shipped icon from src/ and from a flattened lib/', () => {
    expect(findAppIcon(join(import.meta.dirname, '..', 'src', 'daemon'))).toEndWith(
      'assets/AppIcon.icns',
    );
    expect(findAppIcon(join(import.meta.dirname, '..', 'lib'))).toEndWith('assets/AppIcon.icns');
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

describe('signing identity', () => {
  const output = `  1) 3D73955683DC27A412232B38E0D6FCFEBD29E3B6 "Apple Development: Igor Suvorov (WE7QH9359Y)"
  2) AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA "Developer ID Application: Igor Suvorov (7BZ6UJXD8T)"
     2 valid identities found`;
  const identities = parseIdentities(output);

  test('parses security find-identity output', () => {
    expect(identities).toEqual([
      {
        hash: '3D73955683DC27A412232B38E0D6FCFEBD29E3B6',
        name: 'Apple Development: Igor Suvorov (WE7QH9359Y)',
      },
      {
        hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        name: 'Developer ID Application: Igor Suvorov (7BZ6UJXD8T)',
      },
    ]);
  });

  test('prefers Developer ID, settles for Apple Development — both carry a Team ID', () => {
    expect(pickIdentity(identities)?.name).toStartWith('Developer ID Application');
    expect(pickIdentity(identities.slice(0, 1))?.name).toStartWith('Apple Development');
  });

  test('an explicit choice wins: hash, part of the name, or - for ad-hoc', () => {
    expect(pickIdentity(identities, '3d73955683dc27a412232b38e0d6fcfebd29e3b6')?.name).toStartWith(
      'Apple Development',
    );
    expect(pickIdentity(identities, 'Apple Development')?.name).toStartWith('Apple Development');
    expect(pickIdentity(identities, '-')).toBeUndefined();
  });

  test('no Apple-issued identity means ad-hoc', () => {
    expect(pickIdentity([{ hash: 'B'.repeat(40), name: 'My Self-Signed' }])).toBeUndefined();
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

  test('ties the launchd job to the bundle, so Login Items shows its name and icon', () => {
    const base = {
      label: 'l',
      programArguments: ['/x'],
      environment: {},
      workingDirectory: '/',
      outLog: '/o',
      errLog: '/e',
    };
    expect(buildPlist({ ...base, associatedBundleId: 'com.isuvorov.awesome-things' })).toContain(
      '<key>AssociatedBundleIdentifiers</key>\n  <array>\n    <string>com.isuvorov.awesome-things</string>',
    );
    expect(buildPlist(base)).not.toContain('AssociatedBundleIdentifiers');
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

  test('carries the icon inside the signed bundle', () => {
    expect(existsSync(join(paths.app, 'Contents', 'Resources', 'AppIcon.icns'))).toBe(true);
    expect(readFileSync(paths.infoPlist, 'utf-8')).toContain('CFBundleIconFile');
  });

  test('is not rebuilt when nothing changed — a rebuild costs a new permission prompt', async () => {
    const again = await ensureLauncher(paths);
    expect(again.built).toBe(false);
    expect(again.executable).toBe(paths.executable);
  });

  test('with a certificate in the keychain, the signature carries its Team ID', async () => {
    const identity = await findSigningIdentity(undefined);
    if (!identity) return; // CI and machines without one: ad-hoc is all there is.
    const signedPaths = launcherPaths(mkdtempSync(join(dir, 'signed-')), {});
    const result = await ensureLauncher(signedPaths, undefined, identity);
    expect(result.warning).toBeUndefined();
    expect(result.identity?.hash).toBe(identity.hash);
    const info = spawnSync('codesign', ['-dv', signedPaths.app]).stderr.toString();
    expect(info).toMatch(/TeamIdentifier=[A-Z0-9]{10}/);
  }, 30_000);

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
