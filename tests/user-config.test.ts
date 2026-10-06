import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyUserConfig, configPath, parseUserConfig } from '../src/settings/load.js';
import { configJsonSchema, toEnvironment } from '../src/settings/schema.js';

function withConfig(content: unknown, run: (path: string) => void, mode = 0o600) {
  const dir = mkdtempSync(join(tmpdir(), 'awesome-things-config-'));
  const path = join(dir, 'config.json');
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
  chmodSync(path, mode);
  try {
    run(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('configPath', () => {
  test('lives in ~/.config like every other XDG tool', () => {
    expect(configPath('/Users/me', {})).toBe('/Users/me/.config/awesome-things/config.json');
  });

  test('follows XDG_CONFIG_HOME', () => {
    expect(configPath('/Users/me', { XDG_CONFIG_HOME: '/cfg' })).toBe(
      '/cfg/awesome-things/config.json',
    );
  });

  test('AWESOME_THINGS_CONFIG points at a file outright', () => {
    expect(configPath('/Users/me', { AWESOME_THINGS_CONFIG: '/tmp/x.json' })).toBe('/tmp/x.json');
  });
});

describe('parseUserConfig', () => {
  test('accepts the full shape', () => {
    const config = parseUserConfig(
      JSON.stringify({
        $schema: 'https://unpkg.com/awesome-things/config.schema.json',
        port: 32121,
        token: 't',
        tunnel: 'frp',
        frp: { serverAddr: 'balancer', serverPort: 7777 },
      }),
      'config.json',
    );
    expect(config.port).toBe(32121);
    expect(config.frp?.serverPort).toBe(7777);
  });

  test('names the file and the field when a value is wrong', () => {
    expect(() => parseUserConfig('{"port":"abc"}', '/x/config.json')).toThrow(
      /\/x\/config\.json is invalid[\s\S]*port/,
    );
  });

  test('rejects a typo instead of silently ignoring it', () => {
    expect(() => parseUserConfig('{"tokn":"t"}', 'config.json')).toThrow(/tokn/);
  });

  test('explains broken JSON', () => {
    expect(() => parseUserConfig('{port: 1}', 'config.json')).toThrow(/not valid JSON/);
  });
});

describe('toEnvironment', () => {
  test('maps every setting onto the variable the code already reads', () => {
    const env = toEnvironment({
      port: 32121,
      urlToken: 'u',
      tunnel: false,
      frp: { serverAddr: 'balancer' },
      ngrok: { authtoken: 'n' },
    });
    expect(env).toEqual([
      { names: ['AWESOME_THINGS_PORT'], value: '32121' },
      { names: ['AWESOME_THINGS_URL_TOKEN'], value: 'u' },
      { names: ['AWESOME_THINGS_TUNNEL'], value: 'false' },
      { names: ['AWESOME_THINGS_FRP_SERVER_ADDR', 'FRP_SERVER_ADDR'], value: 'balancer' },
      { names: ['NGROK_AUTHTOKEN'], value: 'n' },
    ]);
  });
});

describe('applyUserConfig', () => {
  test('fills the environment from the file', () => {
    withConfig({ port: 32121, token: 'file-token' }, (path) => {
      const env: Record<string, string | undefined> = {};
      const applied = applyUserConfig(env, path);
      expect(env.AWESOME_THINGS_PORT).toBe('32121');
      expect(env.AWESOME_THINGS_TOKEN).toBe('file-token');
      expect(applied.keys).toEqual(['AWESOME_THINGS_PORT', 'AWESOME_THINGS_TOKEN']);
    });
  });

  test('the environment beats the file', () => {
    withConfig({ token: 'file-token' }, (path) => {
      const env: Record<string, string | undefined> = { AWESOME_THINGS_TOKEN: 'shell-token' };
      const applied = applyUserConfig(env, path);
      expect(env.AWESOME_THINGS_TOKEN).toBe('shell-token');
      expect(applied.keys).toEqual([]);
    });
  });

  test('a generic FRP_ variable in the shell also beats the file', () => {
    withConfig({ frp: { serverAddr: 'from-file' } }, (path) => {
      const env: Record<string, string | undefined> = { FRP_SERVER_ADDR: 'from-shell' };
      applyUserConfig(env, path);
      expect(env.AWESOME_THINGS_FRP_SERVER_ADDR).toBeUndefined();
    });
  });

  test('no file is not an error', () => {
    const env: Record<string, string | undefined> = {};
    expect(applyUserConfig(env, '/nope/config.json').loaded).toBe(false);
    expect(env).toEqual({});
  });

  test('warns when other users can read the tokens', () => {
    withConfig(
      { token: 't' },
      (path) => {
        expect(applyUserConfig({}, path).warnings[0]).toContain('chmod 600');
      },
      0o644,
    );
  });

  test('stays quiet about a private file', () => {
    withConfig({ token: 't' }, (path) => {
      expect(applyUserConfig({}, path).warnings).toEqual([]);
    });
  });
});

describe('config.schema.json', () => {
  test('is regenerated from the zod schema — run "bun run build:schema"', () => {
    const committed = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'config.schema.json'), 'utf-8'),
    );
    expect(committed).toEqual(configJsonSchema());
  });
});
