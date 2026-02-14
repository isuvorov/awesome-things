export const MCP_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, mcp-session-id, Last-Event-ID, mcp-protocol-version',
  'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handle(fn: () => Promise<any>) {
  try {
    const result = await fn();
    return json({ ok: true, ...result });
  } catch (err: any) {
    return json({ ok: false, error: err.message || String(err) }, 500);
  }
}

export async function body(req: Request) {
  return req.json() as Promise<Record<string, any>>;
}
