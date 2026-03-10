import { z } from 'zod';

// ── Result Types ────────────────────────────────────────────────

export interface TodoItem {
  name: string;
  status: string;
  notes: string;
  dueDate: string;
  tags: string;
  project: string;
}

export interface SearchResultItem {
  list: string;
  name: string;
  status: string;
  notes: string;
  dueDate: string;
  tags: string;
  project: string;
  area: string;
}

export interface ActionResult {
  message: string;
}

export interface ListTodosResult {
  list: string;
  todos: TodoItem[];
}

export interface SearchTodosResult {
  query: string;
  results: SearchResultItem[];
}

export interface ProjectItem {
  name: string;
  status: string;
  notes: string;
  area?: string;
}

export interface ListProjectsResult {
  area?: string;
  projects: ProjectItem[];
}

export interface GetProjectTodosResult {
  project: string;
  todos: TodoItem[];
}

export interface ListTagsResult {
  tags: string[];
}

export interface ListAreasResult {
  areas: string[];
}

// ── Todo Types ──────────────────────────────────────────────────

export const CreateTodoArgsSchema = z.object({
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
});
export type CreateTodoArgs = z.infer<typeof CreateTodoArgsSchema>;

export const ListTodosArgsSchema = z.object({
  list: z
    .enum(['inbox', 'today', 'anytime', 'upcoming', 'someday', 'logbook'])
    .describe('List to retrieve todos from'),
  status: z
    .enum(['open', 'completed', 'all'])
    .optional()
    .describe('Filter by status (defaults to all)'),
});
export type ListTodosArgs = z.infer<typeof ListTodosArgsSchema>;

export const CompleteTodoArgsSchema = z.object({
  name: z.string().describe('Name of the todo to complete'),
});
export type CompleteTodoArgs = z.infer<typeof CompleteTodoArgsSchema>;

export const UpdateTodoArgsSchema = z.object({
  name: z.string().describe('Current name of the todo to update'),
  new_name: z.string().optional().describe('New name for the todo'),
  new_notes: z.string().optional().describe('New notes for the todo'),
  new_due_date: z
    .string()
    .optional()
    .describe("New due date (YYYY-MM-DD format, or 'none' to clear)"),
  new_tags: z.array(z.string()).optional().describe('New list of tag names'),
});
export type UpdateTodoArgs = z.infer<typeof UpdateTodoArgsSchema>;

export const SearchTodosArgsSchema = z.object({
  query: z.string().describe('Search query to find todos by name'),
});
export type SearchTodosArgs = z.infer<typeof SearchTodosArgsSchema>;

// ── Project Types ───────────────────────────────────────────────

export const CreateProjectArgsSchema = z.object({
  name: z.string().describe('Name of the project'),
  notes: z.string().optional().describe('Additional notes for the project'),
  area: z.string().optional().describe('Area to place the project in'),
});
export type CreateProjectArgs = z.infer<typeof CreateProjectArgsSchema>;

export const ListProjectsArgsSchema = z.object({
  area: z.string().optional().describe('Filter projects by area name'),
});
export type ListProjectsArgs = z.infer<typeof ListProjectsArgsSchema>;

export const GetProjectTodosArgsSchema = z.object({
  project_name: z.string().describe('Name of the project'),
  status: z
    .enum(['open', 'completed', 'all'])
    .optional()
    .describe('Filter by status (defaults to all)'),
});
export type GetProjectTodosArgs = z.infer<typeof GetProjectTodosArgsSchema>;

// ── List/Utility Types ──────────────────────────────────────────

export const ListTagsArgsSchema = z.object({});
export type ListTagsArgs = z.infer<typeof ListTagsArgsSchema>;

export const ListAreasArgsSchema = z.object({});
export type ListAreasArgs = z.infer<typeof ListAreasArgsSchema>;

// ── Move Types ──────────────────────────────────────────────────

export const MoveTodoArgsSchema = z.object({
  todo_name: z.string().describe('Name of the todo to move'),
  destination: z
    .enum(['inbox', 'today', 'evening', 'anytime', 'upcoming', 'someday'])
    .describe('Destination list'),
});
export type MoveTodoArgs = z.infer<typeof MoveTodoArgsSchema>;

export const MoveTodoToProjectArgsSchema = z.object({
  todo_name: z.string().describe('Name of the todo to move'),
  project_name: z.string().describe('Name of the target project'),
});
export type MoveTodoToProjectArgs = z.infer<typeof MoveTodoToProjectArgsSchema>;

export const MoveTodoToAreaArgsSchema = z.object({
  todo_name: z.string().describe('Name of the todo to move'),
  area_name: z.string().describe('Name of the target area'),
});
export type MoveTodoToAreaArgs = z.infer<typeof MoveTodoToAreaArgsSchema>;

export const MoveProjectToAreaArgsSchema = z.object({
  project_name: z.string().describe('Name of the project to move'),
  area_name: z.string().describe('Name of the target area'),
});
export type MoveProjectToAreaArgs = z.infer<typeof MoveProjectToAreaArgsSchema>;

export const RemoveTodoFromProjectArgsSchema = z.object({
  todo_name: z.string().describe('Name of the todo to remove from its project'),
});
export type RemoveTodoFromProjectArgs = z.infer<typeof RemoveTodoFromProjectArgsSchema>;

export const RemoveProjectFromAreaArgsSchema = z.object({
  project_name: z.string().describe('Name of the project to remove from its area'),
});
export type RemoveProjectFromAreaArgs = z.infer<typeof RemoveProjectFromAreaArgsSchema>;

// ── JSON Schemas for MCP Tool Registration ──────────────────────

export const toolSchemas = {
  create_todo: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Name of the todo' },
      notes: { type: 'string', description: 'Additional notes for the todo' },
      due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of tag names to apply',
      },
      list: {
        type: 'string',
        enum: ['inbox', 'today', 'anytime', 'someday'],
        description: 'Target list (defaults to inbox). With project: also moves todo to this list',
      },
      project: {
        type: 'string',
        description: 'Project name to create the todo in',
      },
      area: {
        type: 'string',
        description: 'Area name to place the todo in',
      },
    },
    required: ['name'],
  },
  list_todos: {
    type: 'object' as const,
    properties: {
      list: {
        type: 'string',
        enum: ['inbox', 'today', 'anytime', 'upcoming', 'someday', 'logbook'],
        description: 'List to retrieve todos from',
      },
      status: {
        type: 'string',
        enum: ['open', 'completed', 'all'],
        description: 'Filter by status (defaults to all)',
      },
    },
    required: ['list'],
  },
  complete_todo: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Name of the todo to complete' },
    },
    required: ['name'],
  },
  update_todo: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Current name of the todo to update' },
      new_name: { type: 'string', description: 'New name for the todo' },
      new_notes: { type: 'string', description: 'New notes for the todo' },
      new_due_date: {
        type: 'string',
        description: "New due date (YYYY-MM-DD format, or 'none' to clear)",
      },
      new_tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'New list of tag names',
      },
    },
    required: ['name'],
  },
  search_todos: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query to find todos by name' },
    },
    required: ['query'],
  },
  create_project: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Name of the project' },
      notes: { type: 'string', description: 'Additional notes for the project' },
      area: { type: 'string', description: 'Area to place the project in' },
    },
    required: ['name'],
  },
  list_projects: {
    type: 'object' as const,
    properties: {
      area: { type: 'string', description: 'Filter projects by area name' },
    },
    required: [] as string[],
  },
  get_project_todos: {
    type: 'object' as const,
    properties: {
      project_name: { type: 'string', description: 'Name of the project' },
      status: {
        type: 'string',
        enum: ['open', 'completed', 'all'],
        description: 'Filter by status (defaults to all)',
      },
    },
    required: ['project_name'],
  },
  list_tags: {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  },
  list_areas: {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  },
  move_todo: {
    type: 'object' as const,
    properties: {
      todo_name: { type: 'string', description: 'Name of the todo to move' },
      destination: {
        type: 'string',
        enum: ['inbox', 'today', 'evening', 'anytime', 'upcoming', 'someday'],
        description: 'Destination list',
      },
    },
    required: ['todo_name', 'destination'],
  },
  move_todo_to_project: {
    type: 'object' as const,
    properties: {
      todo_name: { type: 'string', description: 'Name of the todo to move' },
      project_name: { type: 'string', description: 'Name of the target project' },
    },
    required: ['todo_name', 'project_name'],
  },
  move_todo_to_area: {
    type: 'object' as const,
    properties: {
      todo_name: { type: 'string', description: 'Name of the todo to move' },
      area_name: { type: 'string', description: 'Name of the target area' },
    },
    required: ['todo_name', 'area_name'],
  },
  move_project_to_area: {
    type: 'object' as const,
    properties: {
      project_name: { type: 'string', description: 'Name of the project to move' },
      area_name: { type: 'string', description: 'Name of the target area' },
    },
    required: ['project_name', 'area_name'],
  },
  remove_todo_from_project: {
    type: 'object' as const,
    properties: {
      todo_name: {
        type: 'string',
        description: 'Name of the todo to remove from its project',
      },
    },
    required: ['todo_name'],
  },
  remove_project_from_area: {
    type: 'object' as const,
    properties: {
      project_name: {
        type: 'string',
        description: 'Name of the project to remove from its area',
      },
    },
    required: ['project_name'],
  },
};
