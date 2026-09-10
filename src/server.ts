#!/usr/bin/env node
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
  updateProject,
  updateTodo,
} from './api.js';
import { defaultPort } from './config.js';
import { errorMessage } from './server/errors.js';
import { installProcessGuards } from './server/guards.js';
import { body, handle, json, MCP_CORS_HEADERS } from './server/http.js';
import {
  isInteractive,
  type LogExtra,
  logError,
  logRequest,
  printStartupBanner,
  yellow,
} from './server/logger.js';
import { handleMcpRequest, type McpLogSink } from './server/mcp-http.js';
import { APP_ID, MAX_PORT_ATTEMPTS, probePort } from './server/port.js';
import { checkAuth, extractPathToken, resolveToken } from './utils/auth.js';
import { createServer } from './utils/create-server.js';
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
  mcpLog: McpLogSink,
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
    return handleMcpRequest(req, mcpLog);
  }

  // ── Auth ──────────────────────────────────────────────────
  const authError = checkAuth(req, token);
  if (authError) return authError;

  // ── MCP-over-HTTP ─────────────────────────────────────────
  if (pathname === '/mcp') {
    return handleMcpRequest(req, mcpLog);
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

  if (pathname === '/api/projects' && method === 'PUT') {
    return handle(async () => updateProject((await body(req)) as any));
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
  // Installed here (not under `import.meta.main`) because the CLI imports this module.
  installProcessGuards();

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
      const method = req.method;

      let url: URL;
      try {
        url = new URL(req.url);
      } catch (err) {
        logError('Malformed request URL', err);
        return json({ ok: false, error: 'Malformed request URL' }, 400);
      }
      const { pathname, search } = url;

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

      let logged = false;
      let status = 500;
      const finishLog = (info: { toolError?: string } = {}) => {
        if (logged) return;
        logged = true;
        logRequest(method, pathname, status, Math.round(performance.now() - start), {
          ...extra,
          ...(info.toolError ? { toolError: info.toolError } : {}),
        });
      };

      // A streamed MCP response is only "done" once its stream ends, so that
      // branch defers the log line to itself; every other branch logs right away.
      let deferredLog = false;
      const mcpLog = {
        defer: () => {
          deferredLog = true;
        },
        finish: (info: { status: number; toolError?: string }) => {
          status = info.status;
          finishLog(info);
        },
      };

      try {
        const response = await handleRoute(req, url, pathname, method, token, mcpLog);
        status = response.status;
        if (!deferredLog) finishLog();
        return response;
      } catch (err) {
        logError(`${method} ${pathname} failed`, err);
        status = 500;
        finishLog({ toolError: errorMessage(err) });
        return json({ ok: false, error: errorMessage(err) }, 500);
      }
    },
  });

  // ── Tunnel ──────────────────────────────────────────────────────
  const tunnelProvider = options.tunnel;
  let tunnelUrl: string | undefined;
  if (tunnelProvider) {
    printStartupBanner({ port, startPort, token, tunnelProvider });
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    // A spinner in a log file is just noise — only animate on a real terminal.
    const spinner = isInteractive
      ? setInterval(() => {
          const frame = frames[i++ % frames.length];
          process.stdout.write(
            `\r  ${yellow(frame)} ${yellow(`Connecting ${tunnelProvider} tunnel...`)}`,
          );
        }, 80)
      : undefined;
    const stopSpinner = () => {
      if (!spinner) return;
      clearInterval(spinner);
      process.stdout.write('\r\x1b[2K');
    };
    try {
      const { openTunnel } = await import('./utils/tunnel.js');
      tunnelUrl = await openTunnel(port, tunnelProvider, options.ngrokToken, domain);
      stopSpinner();
    } catch (err) {
      stopSpinner();
      logError(`Tunnel (${tunnelProvider}) failed — the local server keeps running`, err);
    }
    printStartupBanner({ port, startPort, token, tunnelUrl, skipHeader: true });
  } else {
    printStartupBanner({ port, startPort, token });
  }

  return server;
}

if (import.meta.main) {
  startServer().catch((err) => {
    logError('Server failed to start', err);
    process.exit(1);
  });
}
