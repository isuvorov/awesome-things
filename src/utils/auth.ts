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

export function checkAuth(req: Request, token: string | undefined): Response | null {
  if (!token) return null;
  const header = req.headers.get('authorization');
  if (header === `Bearer ${token}`) return null;
  return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
