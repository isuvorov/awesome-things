import { describe, expect, test } from 'bun:test';
import { checkAuth, extractPathToken, generateToken, resolveToken } from '../src/utils/auth.js';

describe('resolveToken', () => {
  test('returns flag token when provided', () => {
    expect(resolveToken('my-token')).toBe('my-token');
  });

  test('returns env token when no flag provided', () => {
    const prev = process.env.AWESOME_THINGS_TOKEN;
    process.env.AWESOME_THINGS_TOKEN = 'env-token';
    try {
      expect(resolveToken()).toBe('env-token');
    } finally {
      if (prev === undefined) delete process.env.AWESOME_THINGS_TOKEN;
      else process.env.AWESOME_THINGS_TOKEN = prev;
    }
  });

  test('returns random base64url token when no flag or env provided', () => {
    const prev = process.env.AWESOME_THINGS_TOKEN;
    delete process.env.AWESOME_THINGS_TOKEN;
    try {
      const token = resolveToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    } finally {
      if (prev !== undefined) process.env.AWESOME_THINGS_TOKEN = prev;
    }
  });

  test('flag token takes priority over env', () => {
    const prev = process.env.AWESOME_THINGS_TOKEN;
    process.env.AWESOME_THINGS_TOKEN = 'env-token';
    try {
      expect(resolveToken('flag-token')).toBe('flag-token');
    } finally {
      if (prev === undefined) delete process.env.AWESOME_THINGS_TOKEN;
      else process.env.AWESOME_THINGS_TOKEN = prev;
    }
  });
});

describe('generateToken', () => {
  test('returns 22-char base64url string', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  test('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(tokens.size).toBe(100);
  });
});

describe('checkAuth', () => {
  test('returns null for valid Bearer token', () => {
    const req = new Request('http://localhost/test', {
      headers: { Authorization: 'Bearer secret123' },
    });
    expect(checkAuth(req, 'secret123')).toBeNull();
  });

  test('returns null when token is undefined (no-token mode)', () => {
    const req = new Request('http://localhost/test');
    expect(checkAuth(req, undefined)).toBeNull();
  });

  test('returns 401 for missing Authorization header', () => {
    const req = new Request('http://localhost/test');
    const res = checkAuth(req, 'secret123');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  test('returns 401 for wrong token', () => {
    const req = new Request('http://localhost/test', {
      headers: { Authorization: 'Bearer wrong' },
    });
    const res = checkAuth(req, 'secret123');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  test('returns 401 for non-Bearer auth', () => {
    const req = new Request('http://localhost/test', {
      headers: { Authorization: 'Basic abc' },
    });
    const res = checkAuth(req, 'secret123');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  test('401 response has JSON body', async () => {
    const req = new Request('http://localhost/test');
    const res = checkAuth(req, 'secret123')!;
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: 'Unauthorized' });
  });
});

describe('extractPathToken', () => {
  test('extracts token from /mcp/auth/{token}', () => {
    expect(extractPathToken('/mcp/auth/9a9f3be1-44f0-48ae-8ece-7cdb00787991')).toBe(
      '9a9f3be1-44f0-48ae-8ece-7cdb00787991',
    );
  });

  test('extracts token with trailing slash', () => {
    expect(extractPathToken('/mcp/auth/9a9f3be1-44f0-48ae-8ece-7cdb00787991/')).toBe(
      '9a9f3be1-44f0-48ae-8ece-7cdb00787991',
    );
  });

  test('returns null for /mcp path', () => {
    expect(extractPathToken('/mcp')).toBeNull();
  });

  test('returns null for /mcp/auth/ without token', () => {
    expect(extractPathToken('/mcp/auth/')).toBeNull();
  });

  test('returns null for unrelated paths', () => {
    expect(extractPathToken('/health')).toBeNull();
    expect(extractPathToken('/todos')).toBeNull();
  });

  test('extracts simple string token', () => {
    expect(extractPathToken('/mcp/auth/my-secret-token')).toBe('my-secret-token');
  });
});
