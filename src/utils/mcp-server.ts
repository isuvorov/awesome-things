import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listAreas, listTags } from '../api/list-ops.js';
import {
  moveProjectToArea,
  moveTodo,
  moveTodoToArea,
  moveTodoToProject,
  removeProjectFromArea,
  removeTodoFromProject,
} from '../api/move-ops.js';
import { createProject, getProjectTodos, listProjects } from '../api/project-ops.js';
import { completeTodo, createTodo, listTodos, searchTodos, updateTodo } from '../api/todo-ops.js';

function mcpHandler(fn: (args: any) => Promise<any>) {
  return async (args: any) => {
    try {
      const result = await fn(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
    }
  };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'awesome-things',
    version: '1.0.0',
  });

  // ── Todo Operations ─────────────────────────────────────────────

  server.tool(
    'create_todo',
    'Create a new todo in Things3',
    {
      name: z.string().describe('Name of the todo'),
      notes: z.string().optional().describe('Additional notes for the todo'),
      due_date: z.string().optional().describe('Due date in YYYY-MM-DD format'),
      tags: z.array(z.string()).optional().describe('List of tag names to apply'),
      list: z
        .enum(['inbox', 'today', 'anytime', 'someday'])
        .optional()
        .describe('Target list (defaults to inbox). With project: also moves todo to this list'),
      project: z.string().optional().describe('Project name to create the todo in'),
      area: z.string().optional().describe('Area name to place the todo in'),
    },
    mcpHandler(createTodo),
  );

  server.tool(
    'list_todos',
    'List todos from a specific list in Things3',
    {
      list: z
        .enum(['inbox', 'today', 'anytime', 'upcoming', 'someday', 'logbook'])
        .describe('List to retrieve todos from'),
      status: z
        .enum(['open', 'completed', 'all'])
        .optional()
        .describe('Filter by status (defaults to all)'),
    },
    mcpHandler(listTodos),
  );

  server.tool(
    'complete_todo',
    'Mark a todo as completed in Things3',
    { name: z.string().describe('Name of the todo to complete') },
    mcpHandler(completeTodo),
  );

  server.tool(
    'update_todo',
    "Update an existing todo's properties in Things3",
    {
      name: z.string().describe('Current name of the todo to update'),
      new_name: z.string().optional().describe('New name for the todo'),
      new_notes: z.string().optional().describe('New notes for the todo'),
      new_due_date: z
        .string()
        .optional()
        .describe("New due date (YYYY-MM-DD format, or 'none' to clear)"),
      new_tags: z.array(z.string()).optional().describe('New list of tag names'),
    },
    mcpHandler(updateTodo),
  );

  server.tool(
    'search_todos',
    'Search for todos by name across multiple lists in Things3',
    { query: z.string().describe('Search query to find todos by name') },
    mcpHandler(searchTodos),
  );

  // ── Project Operations ──────────────────────────────────────────

  server.tool(
    'create_project',
    'Create a new project in Things3',
    {
      name: z.string().describe('Name of the project'),
      notes: z.string().optional().describe('Additional notes for the project'),
      area: z.string().optional().describe('Area to place the project in'),
    },
    mcpHandler(createProject),
  );

  server.tool(
    'list_projects',
    'List projects in Things3, optionally filtered by area',
    { area: z.string().optional().describe('Filter projects by area name') },
    mcpHandler(listProjects),
  );

  server.tool(
    'get_project_todos',
    'Get todos within a specific project in Things3',
    {
      project_name: z.string().describe('Name of the project'),
      status: z
        .enum(['open', 'completed', 'all'])
        .optional()
        .describe('Filter by status (defaults to all)'),
    },
    mcpHandler(getProjectTodos),
  );

  // ── List/Utility Operations ─────────────────────────────────────

  server.tool('list_tags', 'List all available tags in Things3', {}, mcpHandler(listTags));
  server.tool('list_areas', 'List all available areas in Things3', {}, mcpHandler(listAreas));

  // ── Move Operations ─────────────────────────────────────────────

  server.tool(
    'move_todo',
    'Move a todo to a built-in list (Inbox, Today, Anytime, Upcoming, Someday)',
    {
      todo_name: z.string().describe('Name of the todo to move'),
      destination: z
        .enum(['inbox', 'today', 'anytime', 'upcoming', 'someday'])
        .describe('Destination list'),
    },
    mcpHandler(moveTodo),
  );

  server.tool(
    'move_todo_to_project',
    'Assign a todo to a project',
    {
      todo_name: z.string().describe('Name of the todo to move'),
      project_name: z.string().describe('Name of the target project'),
    },
    mcpHandler(moveTodoToProject),
  );

  server.tool(
    'move_todo_to_area',
    'Move a todo to an area (removes from any project)',
    {
      todo_name: z.string().describe('Name of the todo to move'),
      area_name: z.string().describe('Name of the target area'),
    },
    mcpHandler(moveTodoToArea),
  );

  server.tool(
    'move_project_to_area',
    'Move a project to an area',
    {
      project_name: z.string().describe('Name of the project to move'),
      area_name: z.string().describe('Name of the target area'),
    },
    mcpHandler(moveProjectToArea),
  );

  server.tool(
    'remove_todo_from_project',
    'Remove a todo from its current project (detach it)',
    { todo_name: z.string().describe('Name of the todo to remove from its project') },
    mcpHandler(removeTodoFromProject),
  );

  server.tool(
    'remove_project_from_area',
    'Remove a project from its current area (detach it)',
    { project_name: z.string().describe('Name of the project to remove from its area') },
    mcpHandler(removeProjectFromArea),
  );

  return server;
}
