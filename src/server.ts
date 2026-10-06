#!/usr/bin/env node
import './settings/autoload.js';
import {
  cancelTodo,
  completeTodo,
  createProject,
  createTodo,
  deleteProject,
  deleteTodo,
  getAreaTodos,
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
import { appVersion, defaultPort } from './config.js';
import { logFiles } from './daemon/logs.js';
import { errorMessage } from './server/errors.js';
import { installProcessGuards } from './server/guards.js';
import { body, handle, isProbePath, json, MCP_CORS_HEADERS } from './server/http.js';
import {
  isInteractive,
  type LogExtra,
  logError,
  logEvent,
  logRequest,
  printStartupBanner,
  yellow,
} from './server/logger.js';
import { handleMcpRequest, type McpLogSink } from './server/mcp-http.js';
import { APP_ID, MAX_PORT_ATTEMPTS, probePort } from './server/port.js';
import { loadUserConfig } from './settings/load.js';
import { authCookieHeader, checkAuth, extractPathToken, resolveToken } from './utils/auth.js';
import { createServer } from './utils/create-server.js';
import {
  FAVICON_SVG,
  generateOpenApiSpec,
  getAuthPage,
  getHomePage,
  getSwaggerHtml,
} from './utils/openapi.js';
import { resolveDomain, resolveTunnelProvider, type TunnelProvider } from './utils/tunnel.js';

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
  // HEAD as well as GET: uptime monitors ping with HEAD and read only the status code,
  // and a 401 there reads as an outage.
  if (pathname === '/health' && (method === 'GET' || method === 'HEAD')) {
    if (method === 'HEAD') return new Response(null, { status: 200 });
    // pid and log paths go only to a caller holding the token: a second `server` run uses
    // them to attach, while an anonymous probe over the tunnel learns nothing but "alive".
    const authed = checkAuth(req, token) === null;
    return json({
      ok: true,
      app: APP_ID,
      port: url.port,
      ...(authed ? { pid: process.pid, tty: Boolean(process.stdout.isTTY), logs: logFiles() } : {}),
    });
  }

  // ── Uptime probes (no auth, not logged) ──────────────────
  // `/__up/<whatever>`: the suffix is the monitor's own service name, never ours, so
  // anything under the prefix answers. Nothing here reveals state beyond "it is alive".
  if (isProbePath(pathname)) {
    if (method === 'GET' || method === 'HEAD') {
      return method === 'HEAD'
        ? new Response(null, { status: 200 })
        : json({ ok: true, app: APP_ID, port: url.port });
    }
  }

  // ── Favicon (no auth) ────────────────────────────────────
  if (pathname === '/favicon.ico' && method === 'GET') {
    return new Response(FAVICON_SVG, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=86400' },
    });
  }

  // ── Sign-in form (no auth — it is how you get the cookie) ─
  if (pathname === '/auth' && method === 'GET') {
    return new Response(getAuthPage(url.searchParams.get('next') || '/'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (pathname === '/auth' && method === 'POST') {
    const form = new URLSearchParams(await req.text());
    const next = form.get('next') || '/';
    const safeNext = next.startsWith('/') ? next : '/';
    if (token && form.get('token') !== token) {
      return new Response(getAuthPage(safeNext, 'Wrong token'), {
        status: 401,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    return new Response(null, {
      status: 303,
      headers: {
        Location: safeNext,
        ...(token ? { 'Set-Cookie': authCookieHeader(token) } : {}),
      },
    });
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

  if (pathname === '/api/todos/cancel' && method === 'POST') {
    return handle(async () => cancelTodo((await body(req)) as any));
  }

  if (pathname === '/api/todos/delete' && method === 'POST') {
    return handle(async () => deleteTodo((await body(req)) as any));
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

  if (pathname === '/api/projects/delete' && method === 'POST') {
    return handle(async () => deleteProject((await body(req)) as any));
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

  const areaTodosMatch = pathname.match(/^\/api\/areas\/(.+)\/todos$/);
  if (areaTodosMatch && method === 'GET') {
    const areaName = decodeURIComponent(areaTodosMatch[1]!);
    const status = url.searchParams.get('status') as any;
    return handle(() => getAreaTodos({ area_name: areaName, status }));
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
      // Two servers cannot share a port, but the second run is still useful: report the
      // instance that owns it and follow its logs when they exist. Exit 0 — this is the
      // expected outcome, and KeepAlive.SuccessfulExit=false relies on it.
      const { attachToRunning } = await import('./server/attach.js');
      await attachToRunning(port, token);
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
        // An uptime monitor polls every few seconds forever — logging that would bury
        // every real request and rotate the log file for nothing.
        if (isProbePath(pathname)) return;
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
  // The env fallback lives here, not in the CLI: `bun run server` imports this
  // module directly and used to ignore AWESOME_THINGS_TUNNEL entirely.
  const tunnelProvider = options.tunnel ?? resolveTunnelProvider();
  let tunnelUrl: string | undefined;
  // A terminal gets the banner; a log file gets events — see logEvent.
  const banner: typeof printStartupBanner = isInteractive ? printStartupBanner : () => {};
  if (!isInteractive) logStarted({ port, startPort, token });
  if (tunnelProvider) {
    banner({ port, startPort, token, tunnelProvider });
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
    if (tunnelUrl && !isInteractive) logEvent('tunnel', tunnelProvider, tunnelUrl);
    banner({ port, startPort, token, tunnelUrl, skipHeader: true });
  } else {
    banner({ port, startPort, token });
  }

  return server;
}

function logStarted({
  port,
  startPort,
  token,
}: {
  port: number;
  startPort: number;
  token: string | undefined;
}) {
  const config = loadUserConfig();
  logEvent(
    'started',
    `v${appVersion}`,
    `pid ${process.pid}`,
    `http://localhost:${port}`,
    port !== startPort ? yellow(`port ${startPort} was busy`) : '',
    token ? 'auth on' : yellow('auth OFF'),
    config.loaded ? `config ${config.path}` : '',
  );
  // launchd stops a job with SIGTERM. Say so, and keep a non-zero code: KeepAlive treats a
  // kill as a crash to recover from, and an exit 0 would stop that.
  for (const [signal, code] of [
    ['SIGTERM', 143],
    ['SIGINT', 130],
  ] as const) {
    process.once(signal, () => {
      logEvent('stopped', signal);
      process.exit(code);
    });
  }
}

if (import.meta.main) {
  startServer().catch((err) => {
    logError('Server failed to start', err);
    process.exit(1);
  });
}
