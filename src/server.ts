#!/usr/bin/env node
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  completeTodo,
  createProject,
  createTodo,
  getProjectTodos,
  listAreas,
  listProjects,
  listTags,
  listTodos,
  moveProjectToArea,
  moveTodo,
  moveTodoToArea,
  moveTodoToProject,
  removeProjectFromArea,
  removeTodoFromProject,
  searchTodos,
  updateTodo,
} from './api.js';
import { defaultPort } from './config.js';
import { body, handle, json, MCP_CORS_HEADERS } from './server/http.js';
import { type LogExtra, logRequest, printStartupBanner, red, yellow } from './server/logger.js';
import { APP_ID, MAX_PORT_ATTEMPTS, probePort } from './server/port.js';
import { checkAuth, extractPathToken, resolveToken } from './utils/auth.js';
import { createServer } from './utils/create-server.js';
import { createMcpServer } from './utils/mcp-server.js';
import { generateOpenApiSpec, getHomePage, getSwaggerHtml } from './utils/openapi.js';
import { resolveDomain, type TunnelProvider } from './utils/tunnel.js';

export interface ServerOptions {
  port?: number;
  token?: string;
  noToken?: boolean;
  tunnel?: TunnelProvider;
  ngrokToken?: string;
  domain?: string;
}

async function handleRoute(
  req: Request,
  url: URL,
  pathname: string,
  method: string,
  token: string | undefined,
): Promise<Response> {
  // ── Home page (no auth) ────────────────────────────────────
  if (pathname === '/' && method === 'GET') {
    return new Response(getHomePage(), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // ── Health (no auth) ─────────────────────────────────────
  if (pathname === '/health' && method === 'GET') {
    return json({ ok: true, app: APP_ID, port: url.port });
  }

  // ── CORS preflight for /mcp ───────────────────────────────
  if ((pathname === '/mcp' || pathname.startsWith('/mcp/auth/')) && method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: MCP_CORS_HEADERS });
  }

  // ── MCP with token-in-path auth (/mcp/auth/{token}) ───────
  const pathToken = extractPathToken(pathname);
  if (pathToken !== null) {
    if (token && pathToken !== token) {
      return json({ ok: false, error: 'Unauthorized' }, 401);
    }
    const transport = new WebStandardStreamableHTTPServerTransport();
    const mcpServer = createMcpServer();
    await mcpServer.connect(transport);
    const response = await transport.handleRequest(req);
    for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
      response.headers.set(key, value);
    }
    return response;
  }

  // ── Auth ──────────────────────────────────────────────────
  const authError = checkAuth(req, token);
  if (authError) return authError;

  // ── MCP-over-HTTP ─────────────────────────────────────────
  if (pathname === '/mcp') {
    const transport = new WebStandardStreamableHTTPServerTransport();
    const mcpServer = createMcpServer();
    await mcpServer.connect(transport);
    const response = await transport.handleRequest(req);
    for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
      response.headers.set(key, value);
    }
    return response;
  }

  // ── Swagger UI & OpenAPI spec ────────────────────────────
  if (pathname === '/api' && method === 'GET') {
    return new Response(getSwaggerHtml(), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (pathname === '/api/openapi.json' && method === 'GET') {
    return json(generateOpenApiSpec());
  }

  // ── Todos ─────────────────────────────────────────────────

  if (pathname === '/api/todos' && method === 'GET') {
    const list = url.searchParams.get('list') || 'today';
    const status = url.searchParams.get('status') as any;
    return handle(() => listTodos({ list: list as any, status }));
  }

  if (pathname === '/api/todos' && method === 'POST') {
    return handle(async () => createTodo((await body(req)) as any));
  }

  if (pathname === '/api/todos' && method === 'PUT') {
    return handle(async () => updateTodo((await body(req)) as any));
  }

  if (pathname === '/api/todos/complete' && method === 'POST') {
    return handle(async () => completeTodo((await body(req)) as any));
  }

  if (pathname === '/api/todos/search' && method === 'GET') {
    const q = url.searchParams.get('q') || '';
    return handle(() => searchTodos({ query: q }));
  }

  // ── Projects ──────────────────────────────────────────────

  if (pathname === '/api/projects' && method === 'GET') {
    const area = url.searchParams.get('area') || undefined;
    return handle(() => listProjects({ area }));
  }

  if (pathname === '/api/projects' && method === 'POST') {
    return handle(async () => createProject((await body(req)) as any));
  }

  const projectTodosMatch = pathname.match(/^\/api\/projects\/(.+)\/todos$/);
  if (projectTodosMatch && method === 'GET') {
    const projectName = decodeURIComponent(projectTodosMatch[1]!);
    const status = url.searchParams.get('status') as any;
    return handle(() => getProjectTodos({ project_name: projectName, status }));
  }

  // ── Tags & Areas ──────────────────────────────────────────

  if (pathname === '/api/tags' && method === 'GET') {
    return handle(() => listTags());
  }

  if (pathname === '/api/areas' && method === 'GET') {
    return handle(() => listAreas());
  }

  // ── Move ──────────────────────────────────────────────────

  if (pathname === '/api/move/todo' && method === 'POST') {
    return handle(async () => moveTodo((await body(req)) as any));
  }

  if (pathname === '/api/move/todo-to-project' && method === 'POST') {
    return handle(async () => moveTodoToProject((await body(req)) as any));
  }

  if (pathname === '/api/move/todo-to-area' && method === 'POST') {
    return handle(async () => moveTodoToArea((await body(req)) as any));
  }

  if (pathname === '/api/move/project-to-area' && method === 'POST') {
    return handle(async () => moveProjectToArea((await body(req)) as any));
  }

  // ── Remove ────────────────────────────────────────────────

  if (pathname === '/api/remove/todo-from-project' && method === 'POST') {
    return handle(async () => removeTodoFromProject((await body(req)) as any));
  }

  if (pathname === '/api/remove/project-from-area' && method === 'POST') {
    return handle(async () => removeProjectFromArea((await body(req)) as any));
  }

  return json({ ok: false, error: 'Not found' }, 404);
}

export async function startServer(options: ServerOptions = {}) {
  const startPort = options.port || defaultPort;
  const token = options.noToken ? undefined : resolveToken(options.token);
  const domain = resolveDomain(options.domain);

  let port = startPort;
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    port = startPort + i;
    const status = await probePort(port);
    if (status === 'ours') {
      console.log(`Port ${port} is already used by ${APP_ID}, reusing not possible`);
      process.exit(0);
    }
    if (status === 'free') break;
    console.log(`Port ${port} is busy (another app), trying ${port + 1}...`);
    if (i === MAX_PORT_ATTEMPTS - 1) {
      throw new Error(`No available port found (tried ${startPort}–${port})`);
    }
  }

  const server = await createServer({
    port,
    async fetch(req) {
      const start = performance.now();
      const url = new URL(req.url);
      const { pathname, search } = url;
      const method = req.method;

      // Extract MCP tool/method name + args for logging
      const extra: LogExtra = {};
      const isMcpRoute = pathname === '/mcp' || pathname.startsWith('/mcp/auth/');
      if (isMcpRoute && method === 'POST') {
        try {
          const jsonBody = await req.clone().json();
          if (jsonBody.method === 'tools/call') {
            extra.toolName = jsonBody.params?.name;
            extra.toolArgs = jsonBody.params?.arguments;
          } else {
            extra.toolName = jsonBody.method;
          }
        } catch {}
      } else if (search) {
        extra.search = search;
      }

      let response: Response;
      try {
        response = await handleRoute(req, url, pathname, method, token);
      } catch (err: any) {
        response = json({ ok: false, error: err.message || String(err) }, 500);
      }

      // For MCP tool calls, tap into the SSE stream to detect isError for logging
      if (isMcpRoute && extra.toolName && response.status === 200 && response.body) {
        const chunks: string[] = [];
        const decoder = new TextDecoder();
        const { readable, writable } = new TransformStream({
          transform(chunk, controller) {
            chunks.push(decoder.decode(chunk, { stream: true }));
            controller.enqueue(chunk);
          },
          flush() {
            try {
              const text = chunks.join('');
              const dataMatch = text.match(/^data: (.+)$/m);
              if (dataMatch) {
                const rpcBody = JSON.parse(dataMatch[1]);
                const content = rpcBody?.result?.content;
                if (Array.isArray(content) && rpcBody?.result?.isError) {
                  const textItem = content.find((c: any) => c.type === 'text');
                  if (textItem?.text) {
                    extra.toolError = textItem.text;
                  }
                }
              }
            } catch {}
            logRequest(
              method,
              pathname,
              response.status,
              Math.round(performance.now() - start),
              extra,
            );
          },
        });
        response.body.pipeTo(writable);
        return new Response(readable, {
          status: response.status,
          headers: response.headers,
        });
      }

      logRequest(method, pathname, response.status, Math.round(performance.now() - start), extra);
      return response;
    },
  });

  // ── Tunnel ──────────────────────────────────────────────────────
  const tunnelProvider = options.tunnel;
  let tunnelUrl: string | undefined;
  if (tunnelProvider) {
    printStartupBanner({ port, startPort, token, tunnelProvider });
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    const spinner = setInterval(() => {
      const frame = frames[i++ % frames.length];
      process.stdout.write(
        `\r  ${yellow(frame)} ${yellow(`Connecting ${tunnelProvider} tunnel...`)}`,
      );
    }, 80);
    try {
      const { openTunnel } = await import('./utils/tunnel.js');
      tunnelUrl = await openTunnel(port, tunnelProvider, options.ngrokToken, domain);
      clearInterval(spinner);
      process.stdout.write('\r\x1b[2K');
    } catch (err: any) {
      clearInterval(spinner);
      process.stdout.write('\r\x1b[2K');
      console.error(`  ${red('✗')} Tunnel error: ${err.message || err}`);
    }
    printStartupBanner({ port, startPort, token, tunnelUrl, skipHeader: true });
  } else {
    printStartupBanner({ port, startPort, token });
  }

  return server;
}

if (import.meta.main) {
  startServer().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}
