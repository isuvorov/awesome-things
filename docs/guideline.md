# Project Guidelines

> **This file contains project documentation for developers.** For AI assistant instructions see [CLAUDE.md](../CLAUDE.md).

Guidelines for awesome-things — Things3 JS/TS API, MCP server, CLI, and HTTP API for macOS.

**Important:**
- Update this file after large project changes
- Run `bun run fix` and `bun run test` after each code change

## Stack

| Tool            | Choice                | Notes                          |
|-----------------|-----------------------|--------------------------------|
| Runtime         | Bun                  | macOS only (AppleScript)       |
| Language        | TypeScript 5.9+      | Strict mode                   |
| Module System   | ESM (nodenext)       | `"type": "module"` in package.json |
| Build           | tsdown               | Primary builder -> `lib/`      |
| Linting         | Biome                | Code quality and formatting   |
| Testing         | bun:test             | Built-in Bun test runner      |
| Bundle Check    | size-limit           | Bundle size constraints       |
| Release         | semantic-release     | Automated versioning and npm publish |
| CI/CD           | GitHub Actions       | Test on PR, release on push to main |
| Validation      | Zod                  | Input validation schemas      |
| CLI             | yargs                | CLI framework                 |
| MCP             | @modelcontextprotocol/sdk | AI assistant integration |

## Project Structure

**Rule:** Only 5 entry-point files in `src/` root: `index.ts`, `api.ts`, `mcp.ts`, `server.ts`, `cli.ts`. Everything else must be in subdirectories (`tools/`, etc.).

```
src/
├── index.ts              # Aggregator — re-exports from api.ts (and potentially other modules)
├── api.ts                # Public JS/TS API — re-exports all functions and types
├── mcp.ts                # MCP server (stdio transport)
├── server.ts             # HTTP REST API + MCP-over-HTTP (Bun.serve)
├── cli.ts                # CLI (yargs)
├── config.ts             # appName, appVersion, appDescription, defaultPort
├── types.ts              # Zod schemas + inferred types
├── api/                  # Things3 operations (AppleScript)
│   ├── todo-ops.ts       # createTodo, listTodos, completeTodo, updateTodo, searchTodos
│   ├── project-ops.ts    # createProject, listProjects, getProjectTodos, updateProject
│   ├── list-ops.ts       # listTags, listAreas
│   └── move-ops.ts       # moveTodo, moveTodoToProject, moveTodoToArea, moveProjectToArea, removeTodoFromProject, removeProjectFromArea
├── server/               # HTTP server internals
│   ├── errors.ts         # errorMessage, formatError, isClientAbort
│   ├── guards.ts         # installProcessGuards — unhandledRejection / uncaughtException
│   ├── http.ts           # json, handle, body, ClientError, CORS headers
│   ├── logger.ts         # Request box, ANSI colors, logError
│   ├── mcp-http.ts       # MCP-over-HTTP: stateless transport per request
│   └── port.ts           # probePort, APP_ID, MAX_PORT_ATTEMPTS
├── tools/                # Output helpers
│   ├── formatters.ts     # CLI output formatting
│   ├── info.ts           # `things info` — package, install source, environment
│   └── parsers.ts        # AppleScript output parsing
└── utils/
    ├── applescript.ts    # AppleScript execution + escaping
    ├── auth.ts           # Token generation, Bearer / path-token checks
    ├── create-server.ts  # Bun.serve / node:http wrapper with error handling
    ├── mcp-server.ts     # MCP tool registration (17 tools)
    ├── openapi.ts        # OpenAPI spec, Swagger UI, home page
    └── tunnel.ts         # Tunnel providers: localtunnel, ngrok, frp
tests/
├── api.test.ts           # API layer tests
├── applescript.test.ts   # Unit tests for pure AppleScript utility functions
├── auth.test.ts          # Token / auth helpers
├── errors.test.ts        # Error formatting, process guards, logError
├── formatters.test.ts    # CLI formatters
├── info.test.ts          # Install-source detection and info formatting
├── parsers.test.ts       # AppleScript output parsers
├── server.test.ts        # HTTP + MCP endpoints, resilience
└── types.test.ts         # Unit tests for Zod schemas
docs/
├── guideline.md          # Project guidelines (this file)
└── logo.png              # Project logo
.github/
└── workflows/
    ├── test.yml          # PR testing (macOS)
    └── release.yml       # Auto-release on push to main
```

## Server Reliability

The HTTP server is a long-running process: a single stray rejection must never take it down,
and every failure must be readable in the log.

| Rule | Where | Why |
|------|-------|-----|
| `installProcessGuards()` inside `startServer()` / `startMcpServer()` | `src/server/guards.ts` | The CLI imports these modules, so `import.meta.main` is `false` — guards placed there never run |
| `Bun.serve({ error })` handler | `src/utils/create-server.ts` | Without it Bun prints a bare `error: undefined` and exits |
| `idleTimeout: 0` | `src/utils/create-server.ts` | Bun's 10s default aborts MCP streams and slow AppleScript calls |
| `GET /mcp` → `405` | `src/server/mcp-http.ts` | In stateless mode a server-initiated SSE stream would hang open forever |
| Transport + MCP server closed after every request | `src/server/mcp-http.ts` | One transport per request must not leak |
| Never read `err.message` directly | everywhere | Anything can be thrown, including `undefined`; use `errorMessage()` / `formatError()` |

Errors are printed by `logError()` with name, message, `code`, stack, `cause` chain and aggregated
errors. On a TTY they are drawn above the request box; when stdout is piped they become plain
ANSI-free lines. Client disconnects (`isClientAbort()`) are logged as expected noise, not crashes.

## Commands

```bash
# Build
bun run build              # Build for production (tsdown -> lib/)
bun run dev                # Watch mode (tsdown)

# Run
bun run start              # Start MCP server (stdio)
bun run server             # Start HTTP API server (port 32123)
bun run cli                # Run CLI

# Testing
bun run test               # Full: lint + types + unit tests + size-limit
bun run test:unit          # Run only unit tests
bun run test:types         # TypeScript type check (tsc --noEmit)
bun run test:lint          # Run biome lint
bun run test:size          # Check bundle size limits

# Fixing
bun run fix                # Auto fix lint & formatting (biome)

# Release
bun run release            # Build + test + semantic-release + npm publish
```

## Architecture

### AppleScript Layer (`applescript.ts`)
- `execute(script)` — runs `osascript` via `Bun.spawn`
- `tellThings(command)` — wraps command in Things3 tell block
- `quoteString(s)` — escapes string for AppleScript
- `buildProperties(props)` — builds property list syntax
- `capitalize(s)` — capitalizes first letter

### Operations (`api/*.ts`)
17 operations grouped by domain. Each takes typed args validated by a Zod schema.

### Tunneling (`utils/tunnel.ts`)
Three providers for exposing the local HTTP server remotely:
- **localtunnel** — default, no config, uses `localtunnel` npm package
- **ngrok** — uses `@ngrok/ngrok`, requires `NGROK_AUTHTOKEN`
- **frp** — spawns `frpc` binary, requires `FRP_SERVER_ADDR` env, self-hosted

CLI flag: `--tunnel`, `--tunnel=ngrok`, `--tunnel=frp`. Also via env: `AWESOME_THINGS_TUNNEL`.

### Interfaces
- **JS/TS API** (`api.ts`) — `import { createTodo } from 'awesome-things'`
- **MCP server** (`mcp.ts`) — stdio transport for Claude/Cursor
- **CLI** (`cli.ts`) — `things add "Buy milk"`
- **HTTP server** (`server.ts`) — `curl http://localhost:32123/api/todos`
- **Aggregator** (`index.ts`) — re-exports everything from `api.ts`

## Lint

Biome configuration:
- Recommended rules, `noExplicitAny: off`
- `useImportExtensions: error` — enforces `.js` extensions in imports
- 2-space indent, 100-char line width, single quotes, semicolons
- Scope: `src/**/*.ts` and `tests/**/*.ts`

## CI/CD

GitHub Actions runs on **macOS** (required for AppleScript):

### Test (on PR to main)
1. Setup Bun + Node.js 22
2. Install deps, build, test

### Release (on push to main)
1. Setup Bun + Node.js LTS
2. Build, test, semantic-release (npm + GitHub release)

## Size Limits

| Entry              | Limit | Note                         |
|--------------------|-------|------------------------------|
| `lib/index.js`     | 4 KB  | Main API (zod ignored)       |
| `lib/applescript.js` | 1 KB | AppleScript utilities       |

## Package Exports

```typescript
// Main API (via index aggregator)
import { createTodo, listTodos, completeTodo } from 'awesome-things';

// Direct API import
import { createTodo, listTodos, completeTodo } from 'awesome-things/api';

// MCP server
import 'awesome-things/mcp';

// HTTP server
import 'awesome-things/server';

// CLI
import 'awesome-things/cli';

// Individual modules
import { execute, tellThings } from 'awesome-things/applescript';
```
