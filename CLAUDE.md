# awesome-things

> **This file contains instructions for AI assistants (Claude).** For project documentation see [docs/guideline.md](docs/guideline.md).

Things3 JS/TS API, MCP server, CLI, and HTTP API for macOS.

**Important:**
- **ALWAYS** update this file and docs/guideline.md when changing scripts, structure, dependencies, or commands — do it in the same step, not after
- Run `bun run fix` if all ok run `bun run test` after each code change
- Before saying "done", always run full `bun run fix` and `bun run test` (partial runs are ok for debugging)
- Always write tests for new functionality (schemas, API, HTTP endpoints)
- Default to using Bun instead of Node.js

## Main Commands
```bash
bun run build       # Build the project (tsdown -> lib/)
bun run test        # Run lint + types + unit tests + size-limit
bun run test:lint   # Run only lints (biome)
bun run test:types  # Check TypeScript types (tsc --noEmit)
bun run test:unit   # Run only unit tests
bun run test:unit:coverage  # Run unit tests with coverage report
bun run test:size   # Check bundle size limits
bun run fix         # Fix lint errors
bun run start       # Start MCP server
bun run server      # Start HTTP API server (port 32123)
bun run cli         # Run CLI
```

## Structure

**Rule:** Only 5 entry-point files allowed in `src/` root: `index.ts`, `api.ts`, `mcp.ts`, `server.ts`, `cli.ts`. All other code must live in subdirectories (`tools/`, etc.).

```
src/
├── index.ts              # Aggregator — re-exports from api.ts
├── api.ts                # Public JS/TS API — re-exports all functions and types
├── mcp.ts                # MCP server (stdio transport)
├── server.ts             # HTTP REST API + MCP-over-HTTP (Bun.serve)
├── cli.ts                # CLI (yargs)
├── config.ts             # appName, appVersion, appDescription, defaultPort
├── types.ts              # Zod schemas + inferred types
├── api/                  # Things3 operations (AppleScript)
│   ├── todo-ops.ts       # Todo operations (create, list, complete, update, search)
│   ├── when.ts           # Things' "When" field (schedule) — not the deadline
│   ├── project-ops.ts    # Project operations (create, list, get todos)
│   ├── list-ops.ts       # Tags and areas listing
│   └── move-ops.ts       # Move and remove operations
├── server/               # HTTP server internals
│   ├── errors.ts         # errorMessage / formatError / isClientAbort
│   ├── guards.ts         # installProcessGuards — process never dies on stray errors
│   ├── http.ts           # json / handle / body helpers + CORS headers
│   ├── logger.ts         # Request box, colors, logError
│   ├── mcp-http.ts       # MCP-over-HTTP: stateless transport per request
│   └── port.ts           # Port probing
├── tools/                # Output helpers (formatters, parsers, info)
└── utils/                # applescript, auth, create-server, mcp-server, openapi, tunnel
```

## Server Reliability Rules
- **Never touch `err.message` directly** — anything can be thrown (`undefined` included). Use `errorMessage(err)` / `formatError(err)` from `src/server/errors.ts`
- `installProcessGuards()` must be called from `startServer()` / `startMcpServer()`, **not** from an `import.meta.main` block — the CLI imports these modules, so `import.meta.main` is `false` there
- `Bun.serve` always needs an `error()` handler, otherwise Bun prints `error: undefined` and kills the process
- `idleTimeout: 0` — MCP streams and AppleScript calls outlive Bun's 10s default
- `GET /mcp` answers `405` on purpose: in stateless mode a server-initiated SSE stream would hang forever

## Key Architecture
- **17 tools** for managing Things3: todos, projects, tags, areas, move/remove
- **AppleScript** — only way to programmatically control Things3 on macOS
- **4 interfaces**: JS/TS API (`api.ts`), MCP server (`mcp.ts`), CLI (`cli.ts`), HTTP API (`server.ts`)
- All operations identify todos/projects by **name** (not ID)
- Zod schemas validate all inputs

## Dependencies
- `@modelcontextprotocol/sdk` — MCP protocol for AI integrations
- `yargs` — CLI framework
- `zod` — input validation

## Testing
- Framework: `bun:test` (describe, test, expect)
- Run with: `bun run test:unit` -> `bun test`
- Unit tests cover pure functions (applescript helpers, zod schemas)
- Integration tests require macOS + Things3 running

## More Info
- Full guideline available at [docs/guideline.md](docs/guideline.md)
- Shared memory across agents and subscriptions: [MEMORY.md](MEMORY.md) — use this instead of internal auto-memory
