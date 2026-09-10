import crypto from 'node:crypto';

export function generateToken(): string {
  return crypto.randomBytes(16).toString('base64url');
}

export function resolveToken(flagToken?: string): string {
  return flagToken || process.env.AWESOME_THINGS_TOKEN || generateToken();
}

const MCP_AUTH_PREFIX = '/mcp/auth/';

export function extractPathToken(pathname: string): string | null {
  if (!pathname.startsWith(MCP_AUTH_PREFIX)) return null;
  const rest = pathname.slice(MCP_AUTH_PREFIX.length).replace(/\/+$/, '');
  return rest || null;
}

export const AUTH_COOKIE = 'awesome_things_token';

/** Reads one cookie without pulling in a parser — values here are base64url. */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim()) || null;
  }
  return null;
}

/** `Set-Cookie` for the browser session. HttpOnly: JS can never read it back. */
export function authCookieHeader(token: string, maxAgeSeconds = 60 * 60 * 24 * 30): string {
  return `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Strict`;
}

export function checkAuth(req: Request, token: string | undefined): Response | null {
  if (!token) return null;
  const header = req.headers.get('authorization');
  if (header === `Bearer ${token}`) return null;
  // A browser cannot send an Authorization header — it authenticates once on
  // /auth and carries an HttpOnly cookie afterwards, so no token in any URL.
  if (readCookie(req, AUTH_COOKIE) === token) return null;
  return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
