# 📋 awesome-things

[![LSK.js](https://github.com/lskjs/presets/raw/main/docs/badge.svg)](https://github.com/lskjs)
[![NPM version](https://badgen.net/npm/v/awesome-things)](https://www.npmjs.com/package/awesome-things)
[![NPM downloads](https://badgen.net/npm/dt/awesome-things)](https://www.npmjs.com/package/awesome-things)
[![Have TypeScript types](https://badgen.net/npm/types/awesome-things)](https://www.npmjs.com/package/awesome-things)
[![Package size](https://img.shields.io/npm/unpacked-size/awesome-things?label=size&color=blue)](https://www.npmjs.com/package/awesome-things)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey.svg?logo=apple&logoColor=white)](#limitations)
[![License](https://badgen.net/github/license/isuvorov/awesome-things)](https://github.com/isuvorov/awesome-things/blob/main/LICENSE)
[![Write us in Telegram](https://img.shields.io/badge/write%20us-0088CC?logo=telegram&logoColor=white)](https://t.me/isuvorov)

<div align="center">
  <h3><p><strong>📋 Awesome swiss knife for Things3 — MCP server, CLI, HTTP API & JS/TS API for macOS 📋</strong></p></h3>
</div>

<img src="https://raw.githubusercontent.com/isuvorov/awesome-things/main/docs/logo.png" align="right" width="200" height="200" alt="awesome-things logo" />

**🤖 MCP server** — connect ChatGPT, Claude & Cursor to manage your tasks <br/>
**⚙️ CLI** — automate from the terminal, cron jobs & pipelines (`thi`, `things`) <br/>
**🌐 HTTP REST API** — build your own frontend; OpenAPI spec + Swagger UI included <br/>
**📦 JS/TS API** — use Things3 as a fully-typed library <br/>
**🔗 Built-in tunnels** — expose your Mac via localtunnel, ngrok or frp <br/>
**🔐 Bearer-token auth** — protect remote access out of the box <br/>
**✅ 17 operations** — todos, projects, tags, areas, move & remove <br/>
**🍏 AppleScript-native** — talks to Things3 directly, validated with Zod <br/>

---

## Installation

```bash
# Library / programmatic use
npm install awesome-things
yarn add awesome-things
pnpm add awesome-things
bun add awesome-things
```

```bash
# Global CLI — exposes the `awesome-things`, `things` and `thi` binaries
npm install -g awesome-things
```

Or run any command on demand without installing:

```bash
npx awesome-things <command>
```

---

## Basic Usage

Expose Things3 to a remote AI client (ChatGPT, Claude) in one command:

```bash
npx awesome-things server --tunnel

#  ➜  MCP: https://my-awesome-things3-mcp.loca.lt/mcp/auth/uvhSdaAsd1qmtAnHa895bcjwTAnBxw
```

1. Run the command in your terminal and copy the printed MCP URL.
2. Paste the URL into your AI client (ChatGPT, Claude, …).
3. Ask the agent to manage your tasks.

**What the AI can do once connected:**

- Create a todo "Buy groceries" in Today
- Show all todos for today
- Complete "Buy groceries"
- Search for todos with "meeting"
- Create project "Q1 Planning" in area "Work"

---

## Usage

### As an MCP server

**Local (stdio)** — add to your MCP client configuration:

```json
{
  "mcpServers": {
    "things3": {
      "command": "npx -y awesome-things mcp"
    }
  }
}
```

**Remote (HTTP over a tunnel)** — point your client at the URL printed by `server --tunnel`:

```json
{
  "mcpServers": {
    "things3": {
      "type": "http",
      "url": "https://my-awesome-things3-mcp.loca.lt/mcp/auth/uvhSdaAsd1qmtAnHa895bcjwTAnBxw"
    }
  }
}
```

<details>
<summary><strong>Client-specific config paths</strong></summary>

**ChatGPT** — [Settings → Beta Features](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt-beta), enable "Developer Mode" and "MCP apps", then add the server in the UI (no file editing).

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`

**Claude Code** — `.claude/settings.json` (project) or `~/.claude/settings.json` (global)

**Cursor** — `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global)

</details>

### As a CLI

> Install globally (`npm i -g awesome-things`) to avoid the `npx` startup delay.
> `thi` and `things` are aliases for `awesome-things`.

```bash
thi list today
thi add "Buy milk" --list today
thi done "Buy cheese"
thi search "report"
thi info                # which build is running, and where it came from
```

Global flags: `--json` for machine-readable output, `--format pretty|table|plain` (`-f`) for the rendering style.

<details>
<summary><strong>All CLI commands</strong></summary>

```bash
# Create a todo
things add "Buy milk"
things add "Submit report" --notes "Q1" --due 2026-03-01 --tags work urgent --list today
things add "Fix leak" --area Home
things add "Plan sprint" --project "Q1 Planning"

# List todos (inbox | today | anytime | upcoming | someday | logbook)
things list              # today (default)
things list inbox
things list today --status open

# Complete a todo (by name or --id)
things done "Buy milk"

# Update a todo
things update "Submit report" --new-name "Submit Q1 report"
things update "Submit report" --new-due 2026-03-15
things update "Submit report" --new-due none      # clear the due date

# Search
things search "report"

# Projects
things project add "Q1 Planning" --area Work
things project update "Q1 Planning" --new-notes "See https://example.com/roadmap"
things project list
things project todos "Q1 Planning"

# Tags & areas
things tags
things areas

# Move (destination: inbox | today | evening | anytime | upcoming | someday)
things move todo "Buy milk" today
things move todo-to-project "Submit report" "Q1 Planning"
things move todo-to-area "Submit report" Work
things move project-to-area "Q1 Planning" Work

# Remove associations
things remove todo-from-project "Submit report"
things remove project-from-area "Q1 Planning"

# Environment info — version, which binary is actually running, where it came from
things info
things info --json
```

</details>

### As an HTTP REST API

```bash
things server                      # default port 32123, random Bearer token printed on startup
things server --no-token           # disable auth (local use)
things server --port 8080          # custom port
```

The server also serves a home page at `/`, a health check at `/health`, **Swagger UI at `/api`**, and the raw OpenAPI spec at `/api/openapi.json`.

<details>
<summary><strong>Endpoints</strong></summary>

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/todos?list=today&status=open` | List todos |
| `POST` | `/api/todos` | Create todo |
| `PUT` | `/api/todos` | Update todo |
| `POST` | `/api/todos/complete` | Complete todo |
| `GET` | `/api/todos/search?q=...` | Search todos |
| `GET` | `/api/projects?area=...` | List projects |
| `POST` | `/api/projects` | Create project |
| `GET` | `/api/projects/:name/todos` | Project todos |
| `GET` | `/api/tags` | All tags |
| `GET` | `/api/areas` | All areas |
| `POST` | `/api/move/todo` | Move todo to list |
| `POST` | `/api/move/todo-to-project` | Move todo to project |
| `POST` | `/api/move/todo-to-area` | Move todo to area |
| `POST` | `/api/move/project-to-area` | Move project to area |
| `POST` | `/api/remove/todo-from-project` | Remove from project |
| `POST` | `/api/remove/project-from-area` | Remove from area |
| `GET` | `/mcp`, `/mcp/auth/{token}` | MCP-over-HTTP transport |

</details>

```bash
curl http://localhost:32123/api/todos?list=today

curl -X POST http://localhost:32123/api/todos \
  -H "Content-Type: application/json" \
  -d '{"name": "Buy milk", "list": "today"}'

curl "http://localhost:32123/api/todos/search?q=report"

# When auth is enabled, pass the printed token:
curl http://localhost:32123/api/tags -H "Authorization: Bearer <token>"
```

### As a JS/TS library

```ts
import { createTodo, listTodos, completeTodo } from 'awesome-things';

// Create a todo
await createTodo({ name: 'Buy milk', list: 'today' });

// List today's open todos
const todos = await listTodos({ list: 'today', status: 'open' });

// Complete a todo
await completeTodo({ name: 'Buy milk' });
```

---

## Configuration

### Tunneling

Built-in tunnel support exposes the local server for remote access — useful for connecting AI clients (ChatGPT, Claude) to Things3 on your Mac. Three providers are supported.

```bash
# localtunnel (default) — free, no signup, no config
things server --tunnel
things server --tunnel --domain myapp                     # custom subdomain

# ngrok — needs an auth token
things server --tunnel=ngrok --ngrok-token=YOUR_TOKEN
NGROK_AUTHTOKEN=YOUR_TOKEN things server --tunnel=ngrok
things server --tunnel=ngrok --domain myapp.ngrok-free.app

# frp — self-hosted reverse proxy; needs the `frpc` binary + your own frp server
FRP_SERVER_ADDR=frp.example.com things server --tunnel=frp
FRP_SERVER_ADDR=frp.example.com things server --tunnel=frp --domain myapp
```

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `AWESOME_THINGS_PORT` / `PORT` | HTTP server port | `32123` |
| `AWESOME_THINGS_TOKEN` | Bearer token for the HTTP/MCP API | random per start |
| `AWESOME_THINGS_TUNNEL` | Tunnel provider (`localtunnel`, `ngrok`, `frp`) | — |
| `AWESOME_THINGS_DOMAIN` | Tunnel domain / subdomain | — |
| `NGROK_AUTHTOKEN` | ngrok auth token | — |
| `FRP_SERVER_ADDR` | frp server address (required for frp) | — |
| `FRP_SERVER_PORT` | frp server port | `7000` |
| `FRP_TOKEN` | frp authentication token | — |
| `FRP_PROTOCOL` | frp protocol (`http` or `https`) | `https` |
| `FRP_SUBDOMAIN` | frp subdomain | — |
| `FRP_REMOTE_PORT` | frp remote port mapping | — |
| `FRP_PROXY_NAME` | proxy name in `frpc` | `things` |

> All `FRP_*` variables also accept the `AWESOME_THINGS_FRP_*` prefix.

---

## How it works

AppleScript is the only programmatic interface to Things3 on macOS. Each operation is a typed function that builds an AppleScript snippet, runs it via `osascript`, and parses the result. The four interfaces are thin layers over the same set of operations.

| Module | Responsibility |
|---|---|
| `src/api.ts` | Public JS/TS API — re-exports all functions and types |
| `src/mcp.ts` | MCP server (stdio transport) |
| `src/server.ts` | HTTP REST API + MCP-over-HTTP (`Bun.serve`) |
| `src/cli.ts` | CLI (yargs) — `things` / `thi` / `awesome-things` |
| `src/api/*.ts` | The 17 todo / project / list / move operations |
| `src/utils/applescript.ts` | `execute`, `tellThings`, `quoteString` helpers |
| `src/utils/tunnel.ts` | localtunnel / ngrok / frp providers |
| `src/utils/auth.ts` | Bearer-token resolution & checks |

All operations identify todos and projects **by name** (or by `id` where supported), and every input is validated with a Zod schema.

---

## API Reference

### Core functions

```ts
import { createTodo, searchTodos, updateTodo, createProject, moveTodoToProject } from 'awesome-things';

// Create with all options
await createTodo({
  name: 'Submit report',
  notes: 'Q1 financials',
  due_date: '2026-03-01',
  tags: ['work', 'urgent'],
  list: 'today',
});

// Create a todo directly in an area
await createTodo({ name: 'Fix leak', area: 'Home' });

// Search across all lists
const results = await searchTodos({ query: 'report' });

// Update a todo
await updateTodo({ name: 'Submit report', new_due_date: '2026-03-15' });

// Create a project and move a todo into it
await createProject({ name: 'Q1 Planning', area: 'Work' });
await moveTodoToProject({ todo_name: 'Submit report', project_name: 'Q1 Planning' });
```

<details>
<summary><strong>All 17 functions</strong></summary>

- `createTodo({ name, notes?, due_date?, tags?, list?, project?, area? })` — create a todo
- `listTodos({ list, status? })` — list todos
- `completeTodo({ name?, id? })` — complete a todo
- `updateTodo({ name?, id?, new_name?, new_notes?, new_due_date?, new_tags? })` — update a todo
- `searchTodos({ query })` — search todos by name
- `createProject({ name, notes?, area? })` — create a project
- `updateProject({ project_name, new_name?, new_notes? })` — update a project
- `listProjects({ area? })` — list projects
- `getProjectTodos({ project_name, status? })` — get project todos
- `listTags()` — list all tags
- `listAreas()` — list all areas
- `moveTodo({ todo_name?, id?, destination })` — move todo to a list
- `moveTodoToProject({ todo_name?, id?, project_name })` — move todo to a project
- `moveTodoToArea({ todo_name?, id?, area_name })` — move todo to an area
- `moveProjectToArea({ project_name, area_name })` — move project to an area
- `removeTodoFromProject({ todo_name?, id? })` — remove todo from its project
- `removeProjectFromArea({ project_name })` — remove project from its area

</details>

### Subpath imports

```ts
import { createTodo } from 'awesome-things';        // main aggregator
import { createTodo } from 'awesome-things/api';    // direct API
import 'awesome-things/mcp';                         // MCP server
import 'awesome-things/server';                      // HTTP server
import 'awesome-things/cli';                         // CLI
```

### Custom AppleScript

```ts
import { execute, tellThings } from 'awesome-things';

const result = await execute(
  tellThings('show quick entry panel with properties {name:"Hello"}'),
);
```

---

## Examples

Add a todo for every `.log` file in the current directory:

```bash
for f in *.log; do thi add "Review $f" --list today; done
```

List today's open todos as JSON and pipe into `jq`:

```bash
thi list today --status open --json | jq '.todos[].name'
```

---

## Tests

```bash
bun run test          # lint + types + unit tests + size-limit
bun run test:unit     # unit tests only (bun:test)
```

Unit tests cover the pure functions (AppleScript helpers, Zod schemas) and the HTTP server. Integration tests require macOS with Things3 running.

---

## Development

```bash
bun install
bun run build       # build (tsdown -> lib/)
bun run dev         # watch mode
bun run start       # MCP server (stdio)
bun run server      # HTTP API server
bun run cli         # run the CLI
bun run fix         # auto-fix lint & formatting (biome)
```

---

## Limitations

- **macOS only** — Things3 has no API other than AppleScript.
- Things3 must be installed and running.
- Operations identify items **by name** (or `id`); duplicate names act on the first match.

---

## License

MIT © [Igor Suvorov](https://github.com/isuvorov) — see [LICENSE](LICENSE).

---

**awesome-things** — _Manage Things3 from anywhere_ 📋
