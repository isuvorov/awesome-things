# 📋 awesome-things

[![NPM version](https://badgen.net/npm/v/awesome-things)](https://www.npmjs.com/package/awesome-things)
[![Tests](https://github.com/isuvorov/awesome-things/actions/workflows/release.yml/badge.svg)](https://github.com/isuvorov/awesome-things/actions/workflows/release.yml)
[![TypeScript + ESM](https://img.shields.io/badge/TypeScript-Ready-brightgreen.svg)](https://www.typescriptlang.org/)
[![Install size](https://packagephobia.now.sh/badge?p=awesome-things)](https://packagephobia.now.sh/result?p=awesome-things)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/awesome-things.svg)](https://bundlephobia.com/result?p=awesome-things)
[![License](https://badgen.net//github/license/isuvorov/awesome-things)](https://github.com/isuvorov/awesome-things/blob/master/LICENSE)
[![Ask me in Telegram](https://img.shields.io/badge/Ask%20me%20in-Telegram-0088CC.svg)](https://t.me/isuvorov)


<div align="center">
  <p><strong>Awesome swiss knife for Things3 – MCP server for AI, CLI, HTTP API, JS/TS API and Web</strong></p>
</div>

<img src="./docs/logo.png" align="right" width="200" height="200" />


**🤖 MCP**: Connect your AI assistants to manage tasks <br/>
**⚙️ CLI**: Automate in console — add tasks on errors, move to lists via crons <br/>
**🌐 HTTP API**: Build your own frontend for task management <br/>
**📦 JS/TS API**: Use in your applications as a library <br/>
**💻 Web**: Manage tasks from your work computer or give colleagues access to lists <br/>


# Basic Usage

```bash
npx awesome-things server --tunnel

#  ➜  MCP: https://my-awesome-things3-mcp.loca.lt/mcp/auth/uvhSdaAsd1qmtAnHa895bcjwTAnBxw
```

1. Run in terminal & Copy MCP URL
2. Copy MCP URL and Paste in your AI Client (ChatGPT, Claude, ....)
3. Ask AI agent


### What AI assistants can do after connecting, Examples:

- Create a todo 'Buy groceries' in Today
- Show all todos for today
- Complete 'Buy groceries'
- Search for todos with 'meeting'
- Create project 'Q1 Planning' in area 'Work'



## Usage as Local CLI MCP Server

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "things3": {
      "command": "npx -y awesome-things mcp"
    }
  }
}
```

or use with tunneling services for remote access (see [Tunneling](#tunneling) below):
```json
{
  "mcpServers": {
    "things3": {
      "command": "https://my-awesome-things3-mcp.loca.lt/mcp/auth/uvhSdaAsd1qmtAnHa895bcjwTAnBxw"
    }
  }
}
```

### Client-specific config paths

<details>
<summary><strong>ChatGPT</strong></summary>

- Go to [Settings → Settings → Beta Features](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt-beta) in ChatGPT  
- Enable "Developer Mode" and "MCP apps"  
- Use the in-app UI to add your MCP server—no file editing required.

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

- `~/Library/Application Support/Claude/claude_desktop_config.json`

</details>

<details>
<summary><strong>Claude Code</strong></summary>

- `.claude/settings.json` (project)  
- `~/.claude/settings.json` (global)

</details>

<details>
<summary><strong>Cursor</strong></summary>

- `.cursor/mcp.json` (project)  
- `~/.cursor/mcp.json` (global)

</details>


---

## Tunneling

Built-in tunnel support lets you expose your local server for remote access — useful for connecting AI clients (ChatGPT, Claude) to Things3 on your Mac.

Three providers are supported:

### localtunnel (default)

```bash
npx awesome-things server --tunnel
# or explicitly:
npx awesome-things server --tunnel=localtunnel
# with custom subdomain:
npx awesome-things server --tunnel --domain myapp
```

No configuration required. Free, no signup.

### ngrok

```bash
npx awesome-things server --tunnel=ngrok
# with auth token:
npx awesome-things server --tunnel=ngrok --ngrok-token=YOUR_TOKEN
# or via env:
NGROK_AUTHTOKEN=YOUR_TOKEN npx awesome-things server --tunnel=ngrok
# with custom domain (paid plan):
npx awesome-things server --tunnel=ngrok --domain myapp.ngrok-free.app
```

### frp (Fast Reverse Proxy)

[frp](https://github.com/fatedier/frp) — self-hosted reverse proxy. Requires `frpc` binary installed and your own frp server.

```bash
# Minimal — server address is required
FRP_SERVER_ADDR=frp.example.com npx awesome-things server --tunnel=frp

# With subdomain
FRP_SERVER_ADDR=frp.example.com npx awesome-things server --tunnel=frp --domain myapp

# Full domain
FRP_SERVER_ADDR=frp.example.com npx awesome-things server --tunnel=frp --domain myapp.example.com

# With authentication
FRP_SERVER_ADDR=frp.example.com FRP_TOKEN=secret npx awesome-things server --tunnel=frp
```

<details>
<summary><strong>All FRP environment variables</strong></summary>

All variables support two prefixes: `AWESOME_THINGS_FRP_*` and `FRP_*`.

| Variable | Default | Description |
|---|---|---|
| `FRP_SERVER_ADDR` | — (required) | FRP server address |
| `FRP_SERVER_PORT` | `7000` | FRP server port |
| `FRP_TOKEN` | — | Authentication token |
| `FRP_PROTOCOL` | `https` | Protocol (`http` or `https`) |
| `FRP_SUBDOMAIN` | — | Subdomain on the FRP server |
| `FRP_REMOTE_PORT` | — | Remote port mapping |
| `FRP_PROXY_NAME` | `things` | Proxy name in frpc |

</details>

> You can also set the tunnel provider via env: `AWESOME_THINGS_TUNNEL=frp`

---

## Usage as CLI


> Note: для устронения задержки советуем установить глобально npm i -g awesome-things
> Note: you can use <strong>npx thi</strong> as an alias for <code>npx awesome-things</code>

```bash
npx awesome-things list today
npx awesome-things add "Buy milk" --evening
npx awesome-things done "Buy cheese"

# You can use alias `npx thi` instead  and make a chains
npm thi search "My report*"

# Automatization examples
ls -1 | head -n 10 | sed 's/^/Fix bug /' | awesome-things add today

thi search "*"

```



### Example: for automatization

```bash
```


<details>
<summary><strong>All CLI commands</strong></summary>

```bash
# Create a todo
things add "Buy milk"
things add "Submit report" --notes "Q1" --due 2026-03-01 --tags work urgent --list today
things add "Fix leak" --area Home

# List todos
things list              # today (default)
things list inbox
things list today -s open

# Complete a todo
things done "Buy milk"

# Update a todo
things update "Submit report" --new-name "Submit Q1 report"
things update "Submit report" --new-due 2026-03-15

# Search
things search "report"

# Projects
things project add "Q1 Planning"
things project list
things project todos "Q1 Planning"

# Tags and areas
things tags
things areas

# Move
things move todo "Buy milk" today
things move todo-to-project "Submit report" "Q1 Planning"

# Remove associations
things remove todo-from-project "Submit report"
```

</details>

---

## Usage as HTTP API

```bash
bun run server                    # port 3001
PORT=8080 bun run server          # custom port
```

<details>
<summary><strong>Endpoints</strong></summary>

| Method | Path | Description |
|---|---|---|
| `GET` | `/todos?list=today&status=open` | List todos |
| `POST` | `/todos` | Create todo |
| `PUT` | `/todos` | Update todo |
| `POST` | `/todos/complete` | Complete todo |
| `GET` | `/todos/search?q=...` | Search todos |
| `GET` | `/projects?area=...` | List projects |
| `POST` | `/projects` | Create project |
| `GET` | `/projects/:name/todos` | Project todos |
| `GET` | `/tags` | All tags |
| `GET` | `/areas` | All areas |
| `POST` | `/move/todo` | Move todo to list |
| `POST` | `/move/todo-to-project` | Move todo to project |
| `POST` | `/move/todo-to-area` | Move todo to area |
| `POST` | `/move/project-to-area` | Move project to area |
| `POST` | `/remove/todo-from-project` | Remove from project |
| `POST` | `/remove/project-from-area` | Remove from area |

</details>

### Examples

```bash
curl http://localhost:3001/todos?list=today

curl -X POST http://localhost:3001/todos \
  -H "Content-Type: application/json" \
  -d '{"name": "Buy milk", "list": "today"}'

curl http://localhost:3001/todos/search?q=report
```

---

## Usage as JS/TS API

### Installation

```bash
npm install awesome-things
```

```ts
import { createTodo, listTodos, completeTodo } from 'awesome-things';

// Create a todo
await createTodo({ name: 'Buy milk', list: 'today' });

// List today's todos
const todos = await listTodos({ list: 'today', status: 'open' });

// Complete a todo
await completeTodo({ name: 'Buy milk' });
```

### More examples

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
<summary><strong>All 16 API functions</strong></summary>

- `createTodo({ name, notes?, due_date?, tags?, list?, project?, area? })` - Create a todo
- `listTodos({ list, status? })` - List todos
- `completeTodo({ name })` - Complete a todo
- `updateTodo({ name, new_name?, new_notes?, new_due_date?, new_tags? })` - Update a todo
- `searchTodos({ query })` - Search todos
- `createProject({ name, notes?, area? })` - Create a project
- `listProjects({ area? })` - List projects
- `getProjectTodos({ project_name, status? })` - Get project todos
- `listTags()` - List all tags
- `listAreas()` - List all areas
- `moveTodo({ todo_name, destination })` - Move todo to list
- `moveTodoToProject({ todo_name, project_name })` - Move todo to project
- `moveTodoToArea({ todo_name, area_name })` - Move todo to area
- `moveProjectToArea({ project_name, area_name })` - Move project to area
- `removeTodoFromProject({ todo_name })` - Remove todo from project
- `removeProjectFromArea({ project_name })` - Remove project from area

</details>

### Custom AppleScript

```ts
import { execute, tellThings } from 'awesome-things';

const result = await execute(
  tellThings('show quick entry panel with properties {name:"Hello"}')
);
```


---

## Development

```bash
bun install
bun run build       # Build (tsdown -> lib/)
bun run test        # Full test suite
bun run fix         # Fix lint issues
```

## License

MIT © [Igor Suvorov](https://github.com/isuvorov)

---

**awesome-things** — _Manage Things3 from anywhere_ 📋

---
