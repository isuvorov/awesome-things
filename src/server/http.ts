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

export class ClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientError';
  }
}

export async function handle(fn: () => Promise<any>) {
  try {
    const result = await fn();
    return json({ ok: true, ...result });
  } catch (err: any) {
    const status = err instanceof ClientError ? 400 : 500;
    return json({ ok: false, error: err.message || String(err) }, status);
  }
}

export async function body(req: Request) {
  try {
    return (await req.json()) as Record<string, any>;
  } catch {
    throw new ClientError('Invalid or missing JSON body');
  }
}
