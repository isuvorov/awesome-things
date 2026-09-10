import { describe, expect, test } from 'bun:test';
import { appVersion } from '../src/config.js';
import { stripAnsi } from '../src/server/logger.js';
import { type AppInfo, collectInfo, detectSource, formatInfo } from '../src/tools/info.js';

const CWD = '/Users/dev/projects/awesome-things';

describe('detectSource', () => {
  test('recognises running straight from src/', () => {
    const bin = `${CWD}/src/cli.ts`;
    expect(detectSource({ bin, realBin: bin, cwd: CWD })).toBe('source (running from src/)');
  });

  test('recognises a global install', () => {
    const bin = '/opt/homebrew/lib/node_modules/awesome-things/lib/cli.js';
    expect(detectSource({ bin, realBin: bin, cwd: CWD })).toBe('global install');
  });

  test('recognises a local node_modules install', () => {
    const bin = `${CWD}/node_modules/awesome-things/lib/cli.js`;
    expect(detectSource({ bin, realBin: bin, cwd: CWD })).toBe('local node_modules');
  });

  test('recognises npx', () => {
    const bin = '/Users/dev/.npm/_npx/abc123/node_modules/awesome-things/lib/cli.js';
    expect(detectSource({ bin, realBin: bin, cwd: CWD })).toBe('npx (temporary install)');
  });

  test('recognises npm link — a bin outside node_modules and outside cwd', () => {
    const bin = '/Users/dev/projects/awesome-things-fork/lib/cli.js';
    expect(detectSource({ bin, realBin: bin, cwd: '/Users/dev/other-project' })).toBe(
      'linked (npm link / dev)',
    );
  });

  test('recognises a symlinked bin', () => {
    expect(
      detectSource({
        bin: '/usr/local/bin/things',
        realBin: '/Users/dev/projects/awesome-things/lib/cli.js',
        cwd: '/Users/dev/somewhere',
      }),
    ).toBe('linked (npm link / dev)');
  });

  test('recognises a build run from its own checkout', () => {
    const bin = `${CWD}/lib/cli.js`;
    expect(detectSource({ bin, realBin: bin, cwd: CWD })).toBe('source (local checkout)');
  });

  test('never throws on an empty bin path', () => {
    expect(detectSource({ bin: '', realBin: '', cwd: CWD })).toBe('unknown');
  });
});

describe('collectInfo', () => {
  test('reports the real package identity', () => {
    const info = collectInfo();
    expect(info.name).toBe('awesome-things');
    expect(info.version).toBe(appVersion);
    expect(info.description.length).toBeGreaterThan(0);
    expect(info.cwd).toBe(process.cwd());
  });

  test('reports the runtime environment', () => {
    const info = collectInfo();
    expect(info.platform).toBe(`${process.platform} ${process.arch}`);
    expect(info.node).toBe(process.version);
    expect(info.runtime).toMatch(/^(bun|node) v/);
    expect(typeof info.port).toBe('number');
  });
});

const SAMPLE: AppInfo = {
  name: 'awesome-things',
  version: '1.2.3',
  description: 'Swiss knife for Things3',
  cwd: '/tmp/project',
  bin: '/tmp/project/lib/cli.js',
  source: 'linked (npm link / dev)',
  platform: 'darwin arm64',
  runtime: 'bun v1.3.11',
  node: 'v24.3.0',
  port: 32_123,
  things3: 'installed (/Applications/Things3.app)',
};

describe('formatInfo', () => {
  const lines = stripAnsi(formatInfo(SAMPLE)).split('\n');

  test('prints one line per field', () => {
    expect(lines).toHaveLength(11);
  });

  test('prefixes every line with the marker and app name', () => {
    for (const line of lines) expect(line.startsWith(' ℹ awesome-things [')).toBe(true);
  });

  test('aligns all values in the same column', () => {
    const valueStarts = lines.map((line) => {
      const afterKey = line.indexOf(']') + 1;
      return afterKey + line.slice(afterKey).search(/\S/);
    });
    expect(new Set(valueStarts).size).toBe(1);
  });

  test('shows every value', () => {
    const text = lines.join('\n');
    for (const value of Object.values(SAMPLE)) expect(text).toContain(String(value));
  });

  test('labels fields in the documented order', () => {
    const labels = lines.map((line) => line.slice(line.indexOf('[') + 1, line.indexOf(']')));
    expect(labels).toEqual([
      'Name',
      'Version',
      'Description',
      'CWD',
      'Bin',
      'Source',
      'Platform',
      'Runtime',
      'Node',
      'Port',
      'Things3',
    ]);
  });
});
