export interface ServeOptions {
  port: number;
  fetch: (req: Request) => Response | Promise<Response>;
}

export interface ServerInstance {
  port: number;
  stop: () => void;
}

declare const Bun: any;

export function createServer(options: ServeOptions): ServerInstance | Promise<ServerInstance> {
  if (typeof Bun !== 'undefined' && typeof Bun.serve === 'function') {
    const server = Bun.serve(options);
    return { port: server.port, stop: () => server.stop() };
  }
  return createNodeServer(options);
}

async function createNodeServer(options: ServeOptions): Promise<ServerInstance> {
  const { createServer: nodeCreateServer } = await import('node:http');

  return new Promise((resolve) => {
    const server = nodeCreateServer(async (req, res) => {
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
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message || String(err) }));
      }
    });

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
