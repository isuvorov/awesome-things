# awesome-things

> **This file contains instructions for AI assistants (Claude).** For project documentation see [docs/guideline.md](docs/guideline.md).

Things3 JS/TS API, MCP server, CLI, and HTTP API for macOS.

**Important:**
- **The assistant's name in this repo is Гондон.** Answer to it, and use it when referring to yourself
- **ALWAYS** update this file and docs/guideline.md when changing scripts, structure, dependencies, or commands — do it in the same step, not after
- Run `bun run fix` if all ok run `bun run test` after each code change
- Before saying "done", always run full `bun run fix` and `bun run test` (partial runs are ok for debugging)
- Always write tests for new functionality (schemas, API, HTTP endpoints)
- Default to using Bun instead of Node.js
- **NEVER start a background or long-lived process here** — see Working Agreement below, this one has already cost an hour

## Working Agreement

Hard-won rules. Every line here is a mistake that was actually made in this repo — read it before
touching git or starting anything.

### Never start a server
`AWESOME_THINGS_TUNNEL=frp` is set in the user's environment and is inherited by every shell. Any
`bun run src/server.ts` — even "just a local check on a spare port" — silently opens its own `frpc`
and **seizes the production domain**, because frp hands the domain to whoever connected last. The
symptom is maddening: the domain answers, serves the right code, and rejects the correct token,
because it is now a different process.

`awesome-things daemon install` / `start` / `restart` start that same server through launchd — they
are the same mistake with a different name, and the agent survives your shell. Write the code, hand
the command to the user, never run it yourself. `daemon status` and `daemon logs` are read-only and
safe (the agent sandbox cannot write to `~/Library`, so even `install` fails there with `EPERM`).

The user already runs a server. Use it instead of starting one:
- `http://localhost:32123`, bearer token in `$AWESOME_THINGS_TOKEN` (already in the shell)
- `AWESOME_THINGS_URL_TOKEN` is a different thing — the Things URL-scheme token, not for HTTP
- ask the user to start it if it is down; do not start it yourself
- if a stray process must be found: `lsof -nP -iTCP -sTCP:LISTEN` and `lsof -nP -iTCP | grep frpc`

### Verify against the real Things3 through that server
Agent bash has no Apple Events access: `osascript` dies with -2741 and the Things3 dictionary never
loads, with or without a sandbox. The user's server process does have the rights, so real
verification means HTTP calls to `localhost:32123`. Unit tests mock `execute()` and prove nothing
about Things3 behaviour. Use scratch objects (`__mvp-check-*`) and delete them afterwards.

### Git
- **Commit to `main` directly.** No branches unless the user asks for one.
- **Never `git add -A` / `git add .` / `git commit -a`.** Stage explicit paths and read
  `git diff --staged --stat` before committing. A blind `add -A` once shipped two 61 MB
  `.bun-build` leftovers of an interrupted `bun build --compile` into `main`, and purging them
  took a rewrite of 25 published commits and their release tags.
- **Author:** the environment forces `GIT_AUTHOR_NAME`/`GIT_COMMITTER_NAME` to `isuvorovBOT`, which
  overrides `.gitconfig`. Checking `git config user.name` does not reveal this. Always export all
  four before committing:
  ```bash
  export GIT_AUTHOR_NAME="Igor Suvorov" GIT_AUTHOR_EMAIL="hi@isuvorov.com"
  export GIT_COMMITTER_NAME="Igor Suvorov" GIT_COMMITTER_EMAIL="hi@isuvorov.com"
  ```
- **Messages:** one line, Conventional Commits, in the style of the existing history. No body, no
  Claude attribution, no co-author trailers.
- **Signing is the user's step** — `~/.gnupg` is unreadable from the agent sandbox (`No secret key`).
  Finish the task by printing exactly:
  ```bash
  git rebase -f -S origin/main && git push
  ```
  `-f` is not optional: without it the rebase is a no-op when the branch is already on top of the
  upstream, so nothing is recreated and nothing gets signed.
- **Checking signatures:** `git cat-file commit <sha> | grep gpgsig`. Never `git log %G?` — without
  keyring access it reports `N` for signed commits too.
- Pushing `main` triggers semantic-release: `feat:` → minor, published to npm automatically.

### Sandbox limits
`ps`, `kill`, `~/.gnupg` and Apple Events are all denied. Never pipe a `kill` through `2>/dev/null`
— the error is the only thing that tells you the process is still alive.

## Main Commands
```bash
bun run build       # Build the project (schema + tsdown -> lib/)
bun run build:schema  # Regenerate config.schema.json from src/settings/schema.ts
bun run build:icon  # Regenerate assets/AppIcon.icns (launcher icon) from docs/logo.png
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
├── daemon/               # launchd background agent (macOS)
│   ├── paths.ts          # Label, plist path, log paths, launchctl service id
│   ├── plist.ts          # Pure plist/env/argv builders
│   ├── launcher.ts       # awesome-things.app — the identity Automation is granted to
│   ├── launchctl.ts      # bootstrap / bootout / kickstart / print + output parsing
│   ├── ops.ts            # up/planUp, install, uninstall, start, stop, restart, status
│   ├── logs.ts           # tail / follow / clear the log files
│   └── format.ts         # Human-readable daemon report
├── api/                  # Things3 operations (AppleScript)
│   ├── todo-ops.ts       # Todo operations (create, list, complete, cancel, delete, update, search)
│   ├── when.ts           # Things' "When" field (schedule) — not the deadline
│   ├── url-scheme.ts     # things:/// fallback — evening, reminders, checklists
│   ├── batch.ts          # runBatch — one todo op applied to an array of ids
│   ├── project-ops.ts    # Project operations (create, list, get todos, delete)
│   ├── area-ops.ts       # Todos sitting directly in an area
│   ├── list-ops.ts       # Tags and areas listing
│   └── move-ops.ts       # Move and remove operations
├── server/               # HTTP server internals
│   ├── errors.ts         # errorMessage / formatError / isClientAbort
│   ├── guards.ts         # installProcessGuards — process never dies on stray errors
│   ├── http.ts           # json / handle / body helpers + CORS headers
│   ├── logger.ts         # Request box, colors, logError
│   ├── mcp-http.ts       # MCP-over-HTTP: stateless transport per request
│   └── port.ts           # Port probing
├── settings/             # ~/.config/awesome-things/config.json → process.env
│   ├── schema.ts         # zod schema, env mapping, JSON Schema generator
│   ├── load.ts           # configPath, parse, applyUserConfig (env beats file)
│   └── autoload.ts       # Side-effect import, first line of cli/server/mcp
├── tools/                # Output helpers (formatters, parsers, info)
└── utils/                # applescript, auth, create-server, mcp-server, openapi, tunnel
```

## Server Reliability Rules
- **Never touch `err.message` directly** — anything can be thrown (`undefined` included). Use `errorMessage(err)` / `formatError(err)` from `src/server/errors.ts`
- `installProcessGuards()` must be called from `startServer()` / `startMcpServer()`, **not** from an `import.meta.main` block — the CLI imports these modules, so `import.meta.main` is `false` there
- `Bun.serve` always needs an `error()` handler, otherwise Bun prints `error: undefined` and kills the process
- `idleTimeout: 0` — MCP streams and AppleScript calls outlive Bun's 10s default
- `GET /mcp` answers `405` on purpose: in stateless mode a server-initiated SSE stream would hang forever

## Daemon Rules (`awesome-things daemon`)
- **`daemon` with no subcommand is `daemon up`** — `planUp()` in `ops.ts` decides: no plist →
  install, a plist flag passed **or the installed plist differs from what install would write
  now** (older version without the launcher, a gone Cellar path) → reinstall, `/health` already
  answers → **do nothing** (a restart
  would hand the frp domain to a new process), launchd runs it but nothing answers → restart,
  installed and down → start. It then attaches to the logs, except under `--json` or a non-TTY
  stdout. Starting it is still the user's step, never the agent's
- **`install` tells the daemon from a hand-started server by pid** — `portOwner()` in `ops.ts`
  compares the pid `/health` reports with `launchctl print`. Only a manual server blocks the
  install; the daemon itself is reloaded, since a rewritten plist means nothing to a running job
- **`install` is idempotent** — `planInstall()` restarts only when the plist bytes changed. A reload
  is bootout → `waitUntilUnloaded()` → bootstrap → `kickstart` (no `-k`): bootstrapping into a
  half-torn-down job returns `Input/output error`, and `kickstart` bypasses `ThrottleInterval`
- **The token must be pinned into the plist.** A daemonized server that mints a random token has
  nowhere to print it — `install` takes `--token`, `AWESOME_THINGS_TOKEN`, the already-installed
  agent's token, or generates one, and the plist is `chmod 600` because it holds that token
- **launchd gives a job almost no environment** — no PATH, no shell profile. `collectEnvironment()`
  bakes in `PATH` (runtime bin dir first, so `frpc` resolves), `HOME` and the `AWESOME_THINGS_*` /
  `FRP_*` / `NGROK_AUTHTOKEN` vars. Changing a var means re-running `daemon install`
- `KeepAlive.SuccessfulExit = false` is deliberate: `startServer()` exits **0** when the port is
  already held by its own twin, and a plain `KeepAlive` would turn that into a respawn loop
- `ProgramArguments` is `[launcher, process.execPath, realpath(argv[1]), 'server']` — never the
  bare bin, whose shebang and exec bit cannot be relied on after `npm link`
- **Never pin a Homebrew Cellar path** — `stableExecPath()` swaps
  `/opt/homebrew/Cellar/node/<ver>/bin/node` for `/opt/homebrew/bin/node` when it is the same file;
  `brew upgrade` deletes the versioned one and the daemon would stop starting
- **Automation belongs to the launcher, never to bun/node.** macOS grants Apple Events to the
  *responsible process* and children inherit it, so `launcher.ts` builds
  `~/.local/share/awesome-things/awesome-things.app` (CFBundleName `awesome-things`, ad-hoc signed
  as `com.isuvorov.awesome-things`) whose C binary *spawns* the runtime (no exec) and forwards
  signals. Rebuild only when `launcherFingerprint()` changes — every rebuild is a new signature and
  a new permission prompt. Nothing may be written into the bundle after `codesign`
- **The launcher is signed with a Team ID when the keychain has one.** Login Items and the
  Automation prompt take name and icon from the code signature; ad-hoc has no Team ID and shows a
  generic "exec" (confirmed on macOS 27, even with `AssociatedBundleIdentifiers` + `LSUIElement`).
  `findSigningIdentity()` picks Developer ID, then Apple Development; `AWESOME_THINGS_SIGN_IDENTITY`
  (`signIdentity` in config.json) overrides, `-` forces ad-hoc. Never `--options runtime`: hardened
  runtime needs the apple-events entitlement before tccd even prompts
- **The launcher icon** is `assets/AppIcon.icns` (shipped in `files`), regenerated from
  `docs/logo.png` by `bun run build:icon` — the tray with the star, no lettering. It is part of the
  fingerprint, so changing it costs every user one Automation prompt; `lsregister -f` after
  signing registers the bundle, and the launchd plist names it in `AssociatedBundleIdentifiers` —
  without that key Login Items draws the job with the generic "exec" icon
- **Log paths follow the rest of the machine**, not macOS: `~/.local/share/<app>/logs/` like
  `openhealth` and `vibe-manager`, overridable with `AWESOME_THINGS_LOG_DIR` or `XDG_DATA_HOME`.
  Never move them back to `~/Library/Logs` — one place everywhere beats a per-OS convention
- **The log holds events, not the banner** — without a TTY `startServer()` prints `logEvent()`
  lines (`started` with version/pid/URL/auth/config, `tunnel`, `stopped` on SIGTERM/SIGINT with
  exit 143/130 so KeepAlive still restarts a killed job). The banner with token and MCP configs is
  terminal-only — never write the token into a log file
- **Logs are the only UI**: launchd redirects stdout/stderr to `~/.local/share/awesome-things/logs/`,
  `logger.ts` prints unboxed lines when stdout is not a TTY, and `daemon logs -f` tails with `-F`
  so following survives the 10 MB rotation
- **`useColor` is not `isInteractive`** — no TTY means no cursor tricks, but the log file is read
  back through `tail`, so colour stays. `install` bakes `FORCE_COLOR=1` into the plist (`--no-color`
  opts out), and `NO_COLOR` always wins
- **`-f` is the global alias for `--format`.** yargs feeds its default `'pretty'` into any `follow`
  option sharing that alias, so `daemon logs` would tail forever — `wantsFollow()` accepts only
  literal `true`
- `daemon status` distinguishes *launchd runs it* (`launchctl print`) from *it answers*
  (`probePort` → `/health`); both are needed, either one alone lies

## Config File Rules
- **`~/.config/awesome-things/config.json` is just another source of env vars.** `applyUserConfig()`
  copies it into `process.env`, never over a variable already set: flag > env > file > default.
  New settings go into `src/settings/schema.ts` *and* `toEnvironment()`; code keeps reading env
- `import './settings/autoload.js'` must stay the **first import** of `cli.ts`, `server.ts`,
  `mcp.ts` — `config.ts` computes `defaultPort` at import time. Never import it from `api.ts`:
  a library must not read `~/.config` or exit on a bad file
- `config.schema.json` (repo root, shipped to npm, served by unpkg) is generated:
  `bun run build:schema` after any schema change — a test fails if it is stale
- `daemon install` keeps keys that came from the file **out of the plist**, so editing the file
  plus `daemon restart` is enough; only flags and shell env get frozen
- **Comment keys:** `_x`, `__x`, `//` are stripped by `stripCommentKeys()` before validation, and
  `config.schema.json` allows them via `patternProperties`. Every other unknown key stays an error
- Tests never see the developer's config: `tests/preload.ts` (bunfig `preload`) points
  `AWESOME_THINGS_CONFIG` at a missing file
- `test:unit` globs `tests/[!s]*.test.ts` — a test file starting with `s` silently never runs

## Key Architecture
- **21 tools** for managing Things3: todos, projects, tags, areas, move/remove/delete
- **AppleScript** — only way to programmatically control Things3 on macOS
- **4 interfaces**: JS/TS API (`api.ts`), MCP server (`mcp.ts`), CLI (`cli.ts`), HTTP API (`server.ts`)
- Todos/projects are addressed by **id or name**; todo ops also take `ids` for batches
- Zod schemas validate all inputs

## Todo Semantics Rules
- **Completing is not deleting.** `complete_todo` → Logbook as *done*; `cancel_todo` → Logbook as
  *cancelled*; `delete_todo` → Trash (`move ... to list "Trash"`). Never use complete to get rid of
  a todo — the Logbook then claims work nobody did
- Every todo operation takes `ids: string[]`; `runBatch` (`src/api/batch.ts`) runs them sequentially
  and reports per-id failures instead of aborting
- Evening, reminder times (`when` with `@HH:MM`) and checklists only exist in the Things URL scheme
  and need `AWESOME_THINGS_URL_TOKEN` — see `src/api/url-scheme.ts`
- **Not supported by Things3 itself**: `repeat` / recurring todos, and headings inside a project.
  Neither AppleScript nor the URL scheme exposes them — do not "add" them, document the workaround
- AppleScript needs Things3 running **and** Automation permission for the host process; sandboxed
  environments fail with -2741 and cannot be used to verify Things3 behaviour

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
