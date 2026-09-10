import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listAreas, listTags } from '../api/list-ops.js';
import {
  moveProjectToArea,
  moveTodo,
  moveTodoToArea,
  moveTodoToProject,
  removeProjectFromArea,
  removeTodoFromProject,
} from '../api/move-ops.js';
import { createProject, getProjectTodos, listProjects, updateProject } from '../api/project-ops.js';
import { completeTodo, createTodo, listTodos, searchTodos, updateTodo } from '../api/todo-ops.js';
import { appName, appVersion } from '../config.js';
import { errorMessage } from '../server/errors.js';
import {
  CompleteTodoArgsBaseSchema,
  CreateProjectArgsSchema,
  CreateTodoArgsSchema,
  GetProjectTodosArgsSchema,
  ListAreasArgsSchema,
  ListProjectsArgsSchema,
  ListTagsArgsSchema,
  ListTodosArgsSchema,
  MoveProjectToAreaArgsSchema,
  MoveTodoArgsBaseSchema,
  MoveTodoToAreaArgsBaseSchema,
  MoveTodoToProjectArgsBaseSchema,
  RemoveProjectFromAreaArgsSchema,
  RemoveTodoFromProjectArgsBaseSchema,
  SearchTodosArgsSchema,
  UpdateProjectArgsSchema,
  UpdateTodoArgsBaseSchema,
} from '../types.js';

function mcpHandler(fn: (args: any) => Promise<any>) {
  return async (args: any) => {
    try {
      const result = await fn(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    } catch (error) {
      const message = errorMessage(error);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: message, code: 'ERR_TOOL_EXECUTION' }),
          },
        ],
        isError: true,
      };
    }
  };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: appName,
    version: appVersion,
  });

  // ── Todo Operations ─────────────────────────────────────────────

  server.tool(
    'create_todo',
    'Create a new todo in Things3',
    CreateTodoArgsSchema.shape,
    mcpHandler(createTodo),
  );

  server.tool(
    'list_todos',
    'List todos from a specific list in Things3',
    ListTodosArgsSchema.shape,
    mcpHandler(listTodos),
  );

  server.tool(
    'complete_todo',
    'Mark a todo as completed in Things3',
    CompleteTodoArgsBaseSchema.shape,
    mcpHandler(completeTodo),
  );

  server.tool(
    'update_todo',
    "Update an existing todo's properties in Things3",
    UpdateTodoArgsBaseSchema.shape,
    mcpHandler(updateTodo),
  );

  server.tool(
    'search_todos',
    'Search for todos by name across multiple lists in Things3',
    SearchTodosArgsSchema.shape,
    mcpHandler(searchTodos),
  );

  // ── Project Operations ──────────────────────────────────────────

  server.tool(
    'create_project',
    'Create a new project in Things3',
    CreateProjectArgsSchema.shape,
    mcpHandler(createProject),
  );

  server.tool(
    'update_project',
    "Update an existing project's name or notes in Things3",
    UpdateProjectArgsSchema.shape,
    mcpHandler(updateProject),
  );

  server.tool(
    'list_projects',
    'List projects in Things3, optionally filtered by area',
    ListProjectsArgsSchema.shape,
    mcpHandler(listProjects),
  );

  server.tool(
    'get_project_todos',
    'Get todos within a specific project in Things3',
    GetProjectTodosArgsSchema.shape,
    mcpHandler(getProjectTodos),
  );

  // ── List/Utility Operations ─────────────────────────────────────

  server.tool(
    'list_tags',
    'List all available tags in Things3',
    ListTagsArgsSchema.shape,
    mcpHandler(listTags),
  );
  server.tool(
    'list_areas',
    'List all available areas in Things3',
    ListAreasArgsSchema.shape,
    mcpHandler(listAreas),
  );

  // ── Move Operations ─────────────────────────────────────────────

  server.tool(
    'move_todo',
    'Move a todo to a built-in list (Inbox, Today, Evening, Anytime, Upcoming, Someday)',
    MoveTodoArgsBaseSchema.shape,
    mcpHandler(moveTodo),
  );

  server.tool(
    'move_todo_to_project',
    'Assign a todo to a project',
    MoveTodoToProjectArgsBaseSchema.shape,
    mcpHandler(moveTodoToProject),
  );

  server.tool(
    'move_todo_to_area',
    'Move a todo to an area (removes from any project)',
    MoveTodoToAreaArgsBaseSchema.shape,
    mcpHandler(moveTodoToArea),
  );

  server.tool(
    'move_project_to_area',
    'Move a project to an area',
    MoveProjectToAreaArgsSchema.shape,
    mcpHandler(moveProjectToArea),
  );

  server.tool(
    'remove_todo_from_project',
    'Remove a todo from its current project (detach it)',
    RemoveTodoFromProjectArgsBaseSchema.shape,
    mcpHandler(removeTodoFromProject),
  );

  server.tool(
    'remove_project_from_area',
    'Remove a project from its current area (detach it)',
    RemoveProjectFromAreaArgsSchema.shape,
    mcpHandler(removeProjectFromArea),
  );

  return server;
}
