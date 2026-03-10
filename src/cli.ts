#!/usr/bin/env bun
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { listAreas, listTags } from './api/list-ops.js';
import {
  moveProjectToArea,
  moveTodo,
  moveTodoToArea,
  moveTodoToProject,
  removeProjectFromArea,
  removeTodoFromProject,
} from './api/move-ops.js';
import { createProject, getProjectTodos, listProjects } from './api/project-ops.js';
import { completeTodo, createTodo, listTodos, searchTodos, updateTodo } from './api/todo-ops.js';
import { appName, appVersion } from './config.js';
import { bold, cyan, dim, green, yellow } from './server/logger.js';
import { type FormatStyle, type Formatters, getFormatters } from './tools/formatters.js';

const LIST_CHOICES = ['inbox', 'today', 'anytime', 'upcoming', 'someday', 'logbook'] as const;
const TARGET_LIST_CHOICES = ['inbox', 'today', 'anytime', 'someday'] as const;
const MOVE_DEST_CHOICES = ['inbox', 'today', 'anytime', 'upcoming', 'someday'] as const;
const STATUS_CHOICES = ['open', 'completed', 'all'] as const;

let useJson = false;
let fmt: Formatters = getFormatters('pretty');

async function run(fn: () => Promise<any>, format: (r: any) => string) {
  try {
    const result = await fn();
    if (useJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(format(result));
    }
  } catch (err: any) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
}

yargs(hideBin(process.argv))
  .scriptName(appName)
  .usage('$0 <command> [options]')
  .option('json', {
    type: 'boolean',
    global: true,
    default: false,
    describe: 'Output as JSON',
  })
  .option('format', {
    alias: 'f',
    choices: ['pretty', 'table', 'plain'] as const,
    global: true,
    default: 'pretty' as const,
    describe: 'Output format',
  })
  .middleware((argv) => {
    useJson = !!argv.json;
    fmt = getFormatters(argv.format as FormatStyle);
  })
  .demandCommand(1, 'Please specify a command')
  .showHelpOnFail(false)
  .fail((msg, _err, yargsInstance) => {
    yargsInstance.showHelp((help) => {
      const colored = help
        // Insert "Other commands:" after server (before colorization)
        .replace(
          new RegExp(`(\\s+support\\n)(  ${appName} add)`, 'm'),
          `$1\n${yellow('Other commands:')}\n$2`,
        )
        .replace(/^(.*<command> \[options\])$/m, bold('$1'))
        .replace(/^(Commands:)$/m, yellow('$1'))
        .replace(/^(Options:)$/m, yellow('$1'))
        .replace(
          new RegExp(`^( {2}${appName} )([\\w-]+(?:\\s+[<[][\\w.]+[>\\]])*)`, 'gm'),
          (_m, _prefix, cmd) => `  ${green(appName)} ${cyan(cmd)}`,
        )
        .replace(
          /^( {2,})(-\w,\s+)?(--[\w-]+)/gm,
          (_m, indent, short, long) =>
            `${indent}${short ? `${yellow(short.trimEnd())} ` : ''}${yellow(long)}`,
        );
      console.log(colored);
    });

    if (msg === 'Please specify a command') {
      const config = { mcpServers: { things3: { command: `npx -y ${appName} mcp` } } };
      console.log(dim('  '));
      console.log(dim('  ── MCP config (CLI) ──'));
      for (const line of JSON.stringify(config, null, 2).split('\n')) {
        console.log(`  ${dim(line)}`);
      }
      console.log();
      console.log(dim('  ── MCP config for ChatGPT ──'));
      console.log(`  ${dim(` Run: ${appName} server --tunnel`)}`);
    }

    console.log();
    console.error(`\x1b[31m${msg}\x1b[0m`);
    process.exit(1);
  })

  // ── MCP server ──────────────────────────────────────────────────

  .command(
    'mcp',
    'Start MCP server (stdio transport)',
    () => {},
    async () => {
      const { startMcpServer } = await import('./mcp.js');
      await startMcpServer();
    },
  )

  // ── HTTP server ────────────────────────────────────────────────

  .command(
    'server',
    'Start HTTP API server with MCP-over-HTTP support',
    (y) =>
      y
        .option('port', {
          type: 'number',
          alias: 'p',
          describe: 'Port to listen on (default: 32123)',
        })
        .option('token', {
          type: 'string',
          describe:
            'Bearer token (default: AWESOME_THINGS_TOKEN env or random). Use --no-token to disable auth.',
        })
        .option('tunnel', {
          describe:
            'Enable tunnel: --tunnel (localtunnel), --tunnel=ngrok, or --tunnel=frp (AWESOME_THINGS_TUNNEL env)',
        })
        .option('ngrok-token', {
          type: 'string',
          describe: 'ngrok auth token (or NGROK_AUTHTOKEN env)',
        })
        .option('domain', {
          type: 'string',
          describe:
            'Tunnel domain (AWESOME_THINGS_DOMAIN env). Subdomain "myapp" or full "myapp.example.com"',
        }),
    async (argv) => {
      const rawTunnel =
        (argv.tunnel as string | boolean | undefined) || process.env.AWESOME_THINGS_TUNNEL;
      let tunnel: 'localtunnel' | 'ngrok' | 'frp' | undefined;
      if (rawTunnel === true || rawTunnel === 'localtunnel') tunnel = 'localtunnel';
      else if (rawTunnel === 'ngrok') tunnel = 'ngrok';
      else if (rawTunnel === 'frp') tunnel = 'frp';
      else if (rawTunnel && typeof rawTunnel === 'string') {
        console.error(
          `Invalid tunnel provider: ${rawTunnel}. Use "localtunnel", "ngrok", or "frp"`,
        );
        process.exit(1);
      }

      // yargs --no-token negation sets argv.token to false at runtime
      const noToken = (argv.token as unknown) === false || (argv as any).noToken === true;
      const { startServer } = await import('./server.js');
      await startServer({
        port: argv.port,
        token: typeof argv.token === 'string' ? argv.token : undefined,
        noToken: noToken || undefined,
        tunnel,
        ngrokToken: argv.ngrokToken as string | undefined,
        domain: argv.domain as string | undefined,
      });
    },
  )

  // ── Todo commands ─────────────────────────────────────────────

  .command(
    'add <name>',
    'Create a new todo',
    (y) =>
      y
        .positional('name', { type: 'string', demandOption: true, describe: 'Todo name' })
        .option('notes', { type: 'string', alias: 'n', describe: 'Notes' })
        .option('due', { type: 'string', alias: 'd', describe: 'Due date (YYYY-MM-DD)' })
        .option('tags', { type: 'array', alias: 't', string: true, describe: 'Tags' })
        .option('list', { choices: TARGET_LIST_CHOICES, alias: 'l', describe: 'Target list' })
        .option('project', {
          type: 'string',
          alias: 'p',
          describe: 'Project to create the todo in',
        })
        .option('area', {
          type: 'string',
          alias: 'a',
          describe: 'Area to place the todo in',
        }),
    (argv) =>
      run(
        () =>
          createTodo({
            name: argv.name!,
            notes: argv.notes,
            due_date: argv.due,
            tags: argv.tags as string[] | undefined,
            list: argv.list,
            project: argv.project,
            area: argv.area,
          }),
        fmt.formatAction,
      ),
  )

  .command(
    'list [list]',
    'List todos from a list',
    (y) =>
      y
        .positional('list', {
          choices: LIST_CHOICES,
          default: 'today' as const,
          describe: 'Which list to show',
        })
        .option('status', {
          choices: STATUS_CHOICES,
          alias: 's',
          describe: 'Filter by status',
        }),
    (argv) => run(() => listTodos({ list: argv.list, status: argv.status }), fmt.formatTodos),
  )

  .command(
    'done <name>',
    'Mark a todo as completed',
    (y) => y.positional('name', { type: 'string', demandOption: true, describe: 'Todo name' }),
    (argv) => run(() => completeTodo({ name: argv.name! }), fmt.formatAction),
  )

  .command(
    'update <name>',
    'Update a todo',
    (y) =>
      y
        .positional('name', {
          type: 'string',
          demandOption: true,
          describe: 'Current todo name',
        })
        .option('new-name', { type: 'string', describe: 'New name' })
        .option('new-notes', { type: 'string', describe: 'New notes' })
        .option('new-due', {
          type: 'string',
          describe: "New due date (YYYY-MM-DD or 'none')",
        })
        .option('new-tags', { type: 'array', string: true, describe: 'New tags' }),
    (argv) =>
      run(
        () =>
          updateTodo({
            name: argv.name!,
            new_name: argv.newName as string | undefined,
            new_notes: argv.newNotes as string | undefined,
            new_due_date: argv.newDue as string | undefined,
            new_tags: argv.newTags as string[] | undefined,
          }),
        fmt.formatAction,
      ),
  )

  .command(
    'search <query>',
    'Search todos by name',
    (y) => y.positional('query', { type: 'string', demandOption: true, describe: 'Search query' }),
    (argv) => run(() => searchTodos({ query: argv.query! }), fmt.formatSearch),
  )

  // ── Project commands ──────────────────────────────────────────

  .command(
    'project',
    'Project operations',
    (y) =>
      y
        .command(
          'add <name>',
          'Create a new project',
          (y) =>
            y
              .positional('name', {
                type: 'string',
                demandOption: true,
                describe: 'Project name',
              })
              .option('notes', { type: 'string', alias: 'n', describe: 'Notes' })
              .option('area', { type: 'string', alias: 'a', describe: 'Area name' }),
          (argv) =>
            run(
              () =>
                createProject({
                  name: argv.name!,
                  notes: argv.notes,
                  area: argv.area,
                }),
              fmt.formatAction,
            ),
        )
        .command(
          'list',
          'List projects',
          (y) => y.option('area', { type: 'string', alias: 'a', describe: 'Filter by area' }),
          (argv) => run(() => listProjects({ area: argv.area }), fmt.formatProjects),
        )
        .command(
          'todos <project>',
          'List todos in a project',
          (y) =>
            y
              .positional('project', {
                type: 'string',
                demandOption: true,
                describe: 'Project name',
              })
              .option('status', {
                choices: STATUS_CHOICES,
                alias: 's',
                describe: 'Filter by status',
              }),
          (argv) =>
            run(
              () =>
                getProjectTodos({
                  project_name: argv.project!,
                  status: argv.status,
                }),
              fmt.formatProjectTodos,
            ),
        )
        .demandCommand(1),
    () => {},
  )

  // ── List commands (tags & areas) ──────────────────────────────

  .command(
    'tags',
    'List all tags',
    () => {},
    () => run(() => listTags(), fmt.formatTags),
  )
  .command(
    'areas',
    'List all areas',
    () => {},
    () => run(() => listAreas(), fmt.formatAreas),
  )

  // ── Move commands ─────────────────────────────────────────────

  .command(
    'move',
    'Move todos and projects',
    (y) =>
      y
        .command(
          'todo <name> <destination>',
          'Move a todo to a list',
          (y) =>
            y
              .positional('name', {
                type: 'string',
                demandOption: true,
                describe: 'Todo name',
              })
              .positional('destination', {
                choices: MOVE_DEST_CHOICES,
                demandOption: true,
                describe: 'Destination list',
              }),
          (argv) =>
            run(
              () =>
                moveTodo({
                  todo_name: argv.name!,
                  destination: argv.destination!,
                }),
              fmt.formatAction,
            ),
        )
        .command(
          'todo-to-project <todo> <project>',
          'Move a todo to a project',
          (y) =>
            y
              .positional('todo', {
                type: 'string',
                demandOption: true,
                describe: 'Todo name',
              })
              .positional('project', {
                type: 'string',
                demandOption: true,
                describe: 'Project name',
              }),
          (argv) =>
            run(
              () =>
                moveTodoToProject({
                  todo_name: argv.todo!,
                  project_name: argv.project!,
                }),
              fmt.formatAction,
            ),
        )
        .command(
          'todo-to-area <todo> <area>',
          'Move a todo to an area',
          (y) =>
            y
              .positional('todo', {
                type: 'string',
                demandOption: true,
                describe: 'Todo name',
              })
              .positional('area', {
                type: 'string',
                demandOption: true,
                describe: 'Area name',
              }),
          (argv) =>
            run(
              () =>
                moveTodoToArea({
                  todo_name: argv.todo!,
                  area_name: argv.area!,
                }),
              fmt.formatAction,
            ),
        )
        .command(
          'project-to-area <project> <area>',
          'Move a project to an area',
          (y) =>
            y
              .positional('project', {
                type: 'string',
                demandOption: true,
                describe: 'Project name',
              })
              .positional('area', {
                type: 'string',
                demandOption: true,
                describe: 'Area name',
              }),
          (argv) =>
            run(
              () =>
                moveProjectToArea({
                  project_name: argv.project!,
                  area_name: argv.area!,
                }),
              fmt.formatAction,
            ),
        )
        .demandCommand(1),
    () => {},
  )

  // ── Remove commands ───────────────────────────────────────────

  .command(
    'remove',
    'Remove associations',
    (y) =>
      y
        .command(
          'todo-from-project <name>',
          'Remove a todo from its project',
          (y) =>
            y.positional('name', {
              type: 'string',
              demandOption: true,
              describe: 'Todo name',
            }),
          (argv) => run(() => removeTodoFromProject({ todo_name: argv.name! }), fmt.formatAction),
        )
        .command(
          'project-from-area <name>',
          'Remove a project from its area',
          (y) =>
            y.positional('name', {
              type: 'string',
              demandOption: true,
              describe: 'Project name',
            }),
          (argv) =>
            run(() => removeProjectFromArea({ project_name: argv.name! }), fmt.formatAction),
        )
        .demandCommand(1),
    () => {},
  )

  .strict()
  .help()
  .alias('h', 'help')
  .version(appVersion)
  .alias('v', 'version')
  .parse();
