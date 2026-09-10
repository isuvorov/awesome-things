import { errorMessage } from '../server/errors.js';
import { logError } from '../server/logger.js';

export interface ServeOptions {
  port: number;
  fetch: (req: Request) => Response | Promise<Response>;
}

export interface ServerInstance {
  port: number;
  stop: (force?: boolean) => void;
}

declare const Bun: any;

function errorResponse(err: unknown): Response {
  return new Response(JSON.stringify({ ok: false, error: errorMessage(err) }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function createServer(options: ServeOptions): ServerInstance | Promise<ServerInstance> {
  if (typeof Bun !== 'undefined' && typeof Bun.serve === 'function') {
    const server = Bun.serve({
      port: options.port,
      // 0 disables the idle timeout. MCP answers over SSE and AppleScript calls can
      // outlive Bun's 10s default, and an aborted request used to crash the process.
      idleTimeout: 0,
      // Never leak stack traces into HTTP responses.
      development: false,
      fetch: options.fetch,
      // Without this handler Bun prints a bare "error: undefined" and dies.
      error(err: unknown) {
        logError('Unhandled server error', err);
        return errorResponse(err);
      },
    });
    return { port: server.port, stop: (force?: boolean) => server.stop(force) };
  }
  return createNodeServer(options);
}

async function createNodeServer(options: ServeOptions): Promise<ServerInstance> {
  const { createServer: nodeCreateServer } = await import('node:http');

  return new Promise((resolve) => {
    const server = nodeCreateServer({ requestTimeout: 0 }, async (req, res) => {
      res.on('error', (err) => logError('Response stream error', err));
      try {
        const url = `http://${req.headers.host || 'localhost'}${req.url || '/'}`;
        const rawBody = await readBody(req);
        const request = new Request(url, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: ['GET', 'HEAD'].includes(req.method || 'GET')
            ? undefined
            : rawBody
              ? new Uint8Array(rawBody)
              : undefined,
        });

        const response = await options.fetch(request);

        res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        const arrayBuffer = await response.arrayBuffer();
        res.end(Buffer.from(arrayBuffer));
      } catch (err) {
        logError('Unhandled server error', err);
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: errorMessage(err) }));
      }
    });

    server.on('clientError', (err, socket) => {
      logError('Client connection error', err);
      if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });
    server.on('error', (err) => logError('Server socket error', err));

    server.listen(options.port, () => {
      resolve({ port: options.port, stop: () => server.close() });
    });
  });
}

function readBody(req: import('node:http').IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => (chunks.length ? resolve(Buffer.concat(chunks)) : resolve(null)));
    req.on('error', reject);
  });
}
